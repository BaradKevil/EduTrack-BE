import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const testEmailConfiguration = async () => {
    console.log('\n🔧 Testing Email Configuration...\n');

    // Check environment variables
    console.log('📋 Checking Environment Variables:');
    console.log(`   SMTP_HOST: ${process.env.SMTP_HOST ? '✓' : '✗ MISSING'}`);
    console.log(`   SMTP_PORT: ${process.env.SMTP_PORT ? '✓' : '✗ MISSING'}`);
    console.log(`   SMTP_USER: ${process.env.SMTP_USER ? '✓' : '✗ MISSING'}`);
    console.log(`   SMTP_PASSWORD: ${process.env.SMTP_PASSWORD ? '✓' : '✗ MISSING'}`);
    console.log(`   FRONTEND_URL: ${process.env.FRONTEND_URL ? '✓' : '✗ MISSING'}\n`);

    if (!process.env.SMTP_HOST || !process.env.SMTP_PORT || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
        console.error('❌ Missing required environment variables!\n');
        console.log('Please check your .env file and ensure all SMTP variables are set.\n');
        process.exit(1);
    }

    try {
        console.log('🔌 Creating SMTP Transporter...');
        
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT),
            secure: process.env.SMTP_PORT === "465",
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD,
            },
            service: process.env.SMTP_SERVICE,
        });

        console.log('✓ Transporter created\n');

        console.log('🔍 Verifying SMTP Connection...');
        await transporter.verify();
        console.log('✓ SMTP Connection Verified!\n');

        console.log('📧 Sending Test Email...');
        
        const info = await transporter.sendMail({
            from: `"EduTrack Test" <${process.env.SMTP_USER}>`,
            to: process.env.SMTP_USER, // Send to yourself
            subject: '✅ EduTrack Email Configuration Test',
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
                    <h2 style="color: #3b82f6;">Email Configuration Successful! 🎉</h2>
                    <p>Your EduTrack email configuration is working correctly.</p>
                    <p><strong>Configuration Details:</strong></p>
                    <ul>
                        <li>SMTP Host: ${process.env.SMTP_HOST}</li>
                        <li>SMTP Port: ${process.env.SMTP_PORT}</li>
                        <li>SMTP User: ${process.env.SMTP_USER}</li>
                        <li>Test Time: ${new Date().toLocaleString()}</li>
                    </ul>
                    <p style="color: #10b981;">You can now use the forgot password and reset password features!</p>
                </div>
            `,
        });

        console.log('✓ Test Email Sent Successfully!\n');
        console.log(`   Message ID: ${info.messageId}`);
        console.log(`   Sent to: ${process.env.SMTP_USER}\n`);
        console.log('✅ All Email Tests Passed!\n');
        console.log('👉 Check your inbox to confirm email delivery.\n');

    } catch (error) {
        console.error('\n❌ Email Configuration Test Failed!\n');
        console.error('Error Details:');
        console.error(`   ${error.message}\n`);

        // Provide specific troubleshooting tips
        if (error.message.includes('Invalid login')) {
            console.log('💡 Troubleshooting Tips:');
            console.log('   - If using Gmail, ensure you have generated an App Password');
            console.log('   - Enable 2-Factor Authentication first');
            console.log('   - Use the App Password, not your regular Gmail password\n');
        } else if (error.message.includes('ECONNREFUSED')) {
            console.log('💡 Troubleshooting Tips:');
            console.log('   - Check if SMTP_HOST and SMTP_PORT are correct');
            console.log('   - Ensure your firewall allows connections on port', process.env.SMTP_PORT);
            console.log('   - Try using port 465 (SSL) or 587 (TLS)\n');
        } else if (error.message.includes('timeout')) {
            console.log('💡 Troubleshooting Tips:');
            console.log('   - Check your internet connection');
            console.log('   - Verify SMTP server is accessible');
            console.log('   - Try a different SMTP port\n');
        }

        process.exit(1);
    }
};

// Run the test
testEmailConfiguration();
