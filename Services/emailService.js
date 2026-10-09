import nodemailer from 'nodemailer';

let transporterInstance = null;

const getTransporter = () => {
    if (transporterInstance) return transporterInstance;

    const port = parseInt(process.env.SMTP_PORT, 10);
    transporterInstance = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
        },
        service: process.env.SMTP_SERVICE,
        pool: true,
    });

    return transporterInstance;
};

export const sendEmail = async ({ to, subject, message }) => {
    try {
        // Validate required fields
        if (!to || !subject || !message) {
            throw new Error("Missing required email fields: to, subject, or message");
        }

        // Validate environment variables
        if (!process.env.SMTP_HOST || !process.env.SMTP_PORT || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
            throw new Error("Missing SMTP configuration in environment variables");
        }

        const transporter = getTransporter();

        const mailOptions = {
            from: `"EduTrack" <${process.env.SMTP_USER}>`,
            to,
            subject,
            html: message,
        };

        // Send email
        const info = await transporter.sendMail(mailOptions);
        
        return info;
        
    } catch (error) {
        console.error("Email service error:", error);
        throw new Error(error.message || "Failed to send email");
    }
};
