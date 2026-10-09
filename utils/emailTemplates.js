export const generateForgotPasswordEmailTemplate = (resetPasswordUrl) => {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset your EduTrack password</title>
</head>
<body style="margin:0; padding:0; background:#f3f6fb; font-family:Arial,sans-serif;">
    <table role="presentation" style="width:100%; border-collapse:collapse;">
    <tr>
        <td align="center" style="padding:32px 12px;">
        <table role="presentation" style="width:100%; max-width:600px; border-collapse:collapse; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e5e7eb;">
            <tr>
            <td style="padding:24px 28px; background:#2563eb;">
                <h1 style="margin:0; color:#ffffff; font-size:22px; font-weight:700;">EduTrack</h1>
            </td>
            </tr>

            <tr>
            <td style="padding:28px;">
                <h2 style="margin:0 0 14px 0; color:#111827; font-size:22px; line-height:1.3;">Reset Your Password</h2>

                <p style="margin:0 0 14px 0; color:#374151; font-size:15px; line-height:1.7;">
                We received a request to reset your EduTrack account password.
                </p>

                <p style="margin:0 0 18px 0; color:#374151; font-size:15px; line-height:1.7;">
                Click the button below to continue. This link expires in <strong>15 minutes</strong>.
                </p>

                <table role="presentation" style="border-collapse:collapse; margin:0 0 18px 0;">
                <tr>
                    <td style="border-radius:8px; background:#2563eb;">
                    <a href="${resetPasswordUrl}" target="_blank" style="display:inline-block; padding:12px 20px; color:#ffffff; font-size:14px; font-weight:700; text-decoration:none;">
                        Reset Password
                    </a>
                    </td>
                </tr>
                </table>

                <p style="margin:0 0 8px 0; color:#6b7280; font-size:13px; line-height:1.6;">
                If the button does not work, copy and paste this link into your browser:
                </p>
                <p style="margin:0 0 18px 0; color:#2563eb; font-size:13px; line-height:1.6; word-break:break-all;">
                ${resetPasswordUrl}
                </p>

                <table role="presentation" style="width:100%; border-collapse:collapse; background:#fef3c7; border-left:4px solid #f59e0b; margin:0 0 18px 0;">
                <tr>
                    <td style="padding:14px;">
                    <p style="margin:0; color:#92400e; font-size:14px; line-height:1.6;">
                        If you did not request this, you can safely ignore this email. Your password will not be changed.
                    </p>
                    </td>
                </tr>
                </table>

                <p style="margin:0; color:#6b7280; font-size:13px; line-height:1.6;">
                This is an automated message. Please do not reply.
                </p>
            </td>
            </tr>

            <tr>
            <td style="padding:16px 28px; background:#f9fafb; border-top:1px solid #e5e7eb;">
                <p style="margin:0; color:#9ca3af; font-size:12px; text-align:center;">
                &copy; ${new Date().getFullYear()} EduTrack. All rights reserved.
                </p>
            </td>
            </tr>
        </table>
        </td>
    </tr>
    </table>
</body>
</html>
    `;
};
export const generatePasswordResetSuccessTemplate = (userName) => {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset Successful</title>
</head>
<body style="margin:0; padding:0; background:#f3f6fb; font-family:Arial,sans-serif;">
    <table role="presentation" style="width:100%; border-collapse:collapse;">
    <tr>
        <td align="center" style="padding:32px 12px;">
        <table role="presentation" style="width:100%; max-width:600px; border-collapse:collapse; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e5e7eb;">
            <tr>
            <td style="padding:24px 28px; background:#16a34a;">
                <h1 style="margin:0; color:#ffffff; font-size:22px; font-weight:700;">EduTrack</h1>
            </td>
            </tr>

            <tr>
            <td style="padding:28px;">
                <h2 style="margin:0 0 14px 0; color:#111827; font-size:22px; line-height:1.3;">Password Changed Successfully</h2>

                <p style="margin:0 0 14px 0; color:#374151; font-size:15px; line-height:1.7;">
                Hello ${userName || "User"},
                </p>

                <p style="margin:0 0 16px 0; color:#374151; font-size:15px; line-height:1.7;">
                This is a confirmation that your EduTrack account password was changed successfully.
                </p>

                <table role="presentation" style="width:100%; border-collapse:collapse; background:#eff6ff; border-left:4px solid #2563eb; margin:0 0 18px 0;">
                <tr>
                    <td style="padding:14px;">
                    <p style="margin:0; color:#1e3a8a; font-size:14px; line-height:1.6;">
                        If you did not perform this action, please reset your password immediately and contact support.
                    </p>
                    </td>
                </tr>
                </table>

                <p style="margin:0; color:#6b7280; font-size:13px; line-height:1.6;">
                This is an automated message. Please do not reply.
                </p>
            </td>
            </tr>

            <tr>
            <td style="padding:16px 28px; background:#f9fafb; border-top:1px solid #e5e7eb;">
                <p style="margin:0; color:#9ca3af; font-size:12px; text-align:center;">
                &copy; ${new Date().getFullYear()} EduTrack. All rights reserved.
                </p>
            </td>
            </tr>
        </table>
        </td>
    </tr>
    </table>
</body>
</html>
    `;
}

/**
 * Request Accepted Email
 */
export function generateRequestAcceptedTemplate(panelName) {
    return `
    <div style="font-family: Arial; padding:20px; background:#fff; border:1px solid #ddd; border-radius:8px;">
        <h2 style="color:#10b981;">✅ Project Request Accepted</h2>
        <p>Your project request has been accepted by <strong>${panelName}</strong>.</p>
        <p>You can now start working on your project and upload files.</p>
    </div>
    `;
}

/**
 * Request Rejected Email
 */
export function generateRequestRejectedTemplate(panelName) {
    return `
    <div style="font-family: Arial; padding:20px; background:#fff; border:1px solid #ddd; border-radius:8px;">
        <h2 style="color:#ef4444;">❌ Project Request Rejected</h2>
        <p>Your project request has been rejected by <strong>${panelName}</strong>.</p>
        <p>You can try requesting another project.</p>
    </div>
    `;
}


