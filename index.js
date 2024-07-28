require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const formData = require('form-data');
const Mailgun = require('mailgun.js');
const mailgun = new Mailgun(formData);
const AWS = require('aws-sdk');

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.send('Mail Notification Service');
});

// Initialize mailgun
const mg = mailgun.client({username: 'api', key:process.env.MAILGUN_API_KEY});

// Initialize SES
const ses = new AWS.SES({
    accessKeyId: process.env.SES_ACCESS_KEY,
    secretAccessKey: process.env.SES_SECRET_KEY,
    region: process.env.SES_REGION
});

const sendEmailWithMailgun = (mailOptions) => {
    return new Promise((resolve, reject) => {
        mg.messages.create(process.env.MAILGUN_DOMAIN , mailOptions).then(msg => console.log(msg)).catch(err => console.log(err));
    });
};

const sendEmailWithSES = (mailOptions) => {
    const params = {
        Source: mailOptions.from,
        Destination: { ToAddresses: [mailOptions.to] },
        Message: {
            Subject: { Data: mailOptions.subject },
            Body: { Text: { Data: mailOptions.text } }
        }
    };

    return new Promise((resolve, reject) => {
        ses.sendEmail(params, (error, data) => {
            if (error) {
                reject(error);
            } else {
                resolve(data);
            }
        });
    });
};

const retryEmails = [];
const unsubscribeList = [];

const sendEmailWithRetry = (mailOptions, retries = 3) => {
    sendEmailWithMailgun(mailOptions)
        .then(response => console.log('Email sent using Mailgun:', response))
        .catch(error => {
            if (retries > 0) {
                console.log(`Retrying... Attempts left: ${retries}`);
                setTimeout(() => {
                    sendEmailWithRetry(mailOptions, retries - 1);
                }, 5000);
            } else {
                console.log('Mailgun failed, switching to SES');
                sendEmailWithSES(mailOptions)
                    .then(response => console.log('Email sent using SES:', response))
                    .catch(err => {
                        console.error('Both Mailgun and SES failed', err);
                        retryEmails.push(mailOptions);
                    });
            }
        });
};

app.post('/send-email', (req, res) => {
    const { to, subject, text, html } = req.body;

    if (unsubscribeList.includes(to)) {
        return res.status(400).send('This email has unsubscribed');
    }

    const mailOptions = {
        from: "testlive@gmail.com",
        to: to,
        subject: subject,
        text: text,
        html: html
    };

    sendEmailWithRetry(mailOptions);
    res.status(200).send('Email sending initiated');
});

app.post('/unsubscribe', (req, res) => {
    const { email } = req.body;
    if (email) {
        unsubscribeList.push(email);
        res.status(200).send('Unsubscribed successfully');
    } else {
        res.status(400).send('Email is required');
    }
});

app.post('/bounce', (req, res) => {
    const { bouncedEmail } = req.body;
    // Handle the bounced email, e.g., remove from mailing list
    res.status(200).send('Bounce received');
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
