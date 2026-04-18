/**
 * emailService.js — sends transactional emails via Resend.
 *
 * Environment variables:
 *   RESEND_API_KEY   — API key from resend.com (required for real delivery)
 *   RESEND_FROM      — sender address, e.g. "Briya Rooms <noreply@briya.org>"
 *                      defaults to "Briya Room Reservations <noreply@briya.org>"
 *
 * If RESEND_API_KEY is not configured the code falls back to console.log so
 * development and staging work without needing real credentials.
 */

import { Resend } from 'resend'

let resend = null

function getClient() {
  if (resend) return resend
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  resend = new Resend(key)
  return resend
}

// Prefer EMAIL_FROM (.env key already in use), fall back to RESEND_FROM, then default
const FROM = process.env.EMAIL_FROM || process.env.RESEND_FROM || 'Briya Room Reservations <noreply@briya.org>'

/**
 * Send the 6-digit OTP email to the booking owner.
 *
 * @param {string} to            recipient email
 * @param {string} otp           plaintext 6-digit code
 * @param {string|number} reservationId
 */
export async function sendOtpEmail(to, otp, reservationId) {
  const client = getClient()

  if (!client) {
    // Dev / staging fallback — print to console so the OTP can be tested
    console.log('\n[OTP] ══════════════════════════════════════')
    console.log(`[OTP]  Reservation : ${reservationId}`)
    console.log(`[OTP]  To          : ${to}`)
    console.log(`[OTP]  Code        : ${otp}`)
    console.log(`[OTP]  Expires     : 10 minutes`)
    console.log('[OTP]  (RESEND_API_KEY not set — email not sent)')
    console.log('[OTP] ══════════════════════════════════════\n')
    return
  }

  const html = buildOtpHtml(otp, reservationId)

  try {
    const { data, error } = await client.emails.send({
      from:    FROM,
      to:      [to],
      subject: `Your Briya Room Reservation verification code: ${otp}`,
      html,
    })
    if (error) {
      console.error(`[email] Resend error for ${to}:`, error)
    } else {
      console.log(`[email] OTP sent to ${to} — id: ${data?.id}`)
    }
  } catch (err) {
    console.error(`[email] Failed to send OTP to ${to}:`, err.message)
    // Never re-throw — a send failure must not block the API response
  }
}

/**
 * Send a login verification OTP to the user's @briya.org email.
 *
 * @param {string} to   recipient email
 * @param {string} otp  plaintext 6-digit code
 */
export async function sendLoginOtpEmail(to, otp) {
  const client = getClient()

  if (!client) {
    console.log('\n[LOGIN-OTP] ══════════════════════════════════════')
    console.log(`[LOGIN-OTP]  To          : ${to}`)
    console.log(`[LOGIN-OTP]  Code        : ${otp}`)
    console.log(`[LOGIN-OTP]  Expires     : 10 minutes`)
    console.log('[LOGIN-OTP]  (RESEND_API_KEY not set — email not sent)')
    console.log('[LOGIN-OTP] ══════════════════════════════════════\n')
    return
  }

  const html = buildLoginOtpHtml(otp)

  try {
    const { data, error } = await client.emails.send({
      from:    FROM,
      to:      [to],
      subject: `Your Briya login verification code: ${otp}`,
      html,
    })
    if (error) {
      console.error(`[email] Resend error (login OTP) for ${to}:`, error)
    } else {
      console.log(`[email] Login OTP sent to ${to} — id: ${data?.id}`)
    }
  } catch (err) {
    console.error(`[email] Failed to send login OTP to ${to}:`, err.message)
  }
}

// ── HTML template ─────────────────────────────────────────────

function buildOtpHtml(otp, reservationId) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verification Code</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.10);overflow:hidden;max-width:94vw;">

          <!-- Header -->
          <tr>
            <td style="background:#1a3557;padding:24px 32px;">
              <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">
                Briya Room Reservations
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 24px;">
              <p style="margin:0 0 8px;font-size:16px;color:#1a3557;font-weight:700;">
                Your verification code
              </p>
              <p style="margin:0 0 28px;font-size:14px;color:#555;line-height:1.6;">
                Someone requested permission to edit reservation&nbsp;<strong>#${reservationId}</strong>.
                Use the code below to confirm it&apos;s you. It expires in <strong>10 minutes</strong>.
              </p>

              <!-- OTP code box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <div style="display:inline-block;background:#f0f7ff;border:2px solid #1186c4;
                                border-radius:10px;padding:18px 36px;">
                      <span style="font-size:38px;font-family:'Courier New',Courier,monospace;
                                   font-weight:700;letter-spacing:0.45em;color:#1a3557;">
                        ${otp}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:13px;color:#888;line-height:1.6;">
                If you did not request this code, you can safely ignore this email.
                Your booking has not been changed.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8f9fa;padding:16px 32px;border-top:1px solid #e8ecf0;">
              <p style="margin:0;font-size:11px;color:#aaa;text-align:center;">
                Briya Public Charter School · Room Reservation System
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function buildLoginOtpHtml(otp) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verification Code</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.10);overflow:hidden;max-width:94vw;">

          <!-- Header -->
          <tr>
            <td style="background:#1a3557;padding:24px 32px;">
              <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">
                Briya Room Reservations
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 24px;">
              <p style="margin:0 0 8px;font-size:16px;color:#1a3557;font-weight:700;">
                Verify your email to sign in
              </p>
              <p style="margin:0 0 28px;font-size:14px;color:#555;line-height:1.6;">
                Use the code below to verify your Briya email address and complete sign-in.
                It expires in <strong>10 minutes</strong>.
              </p>

              <!-- OTP code box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <div style="display:inline-block;background:#f0f7ff;border:2px solid #1186c4;
                                border-radius:10px;padding:18px 36px;">
                      <span style="font-size:38px;font-family:'Courier New',Courier,monospace;
                                   font-weight:700;letter-spacing:0.45em;color:#1a3557;">
                        ${otp}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:13px;color:#888;line-height:1.6;">
                If you did not attempt to sign in, you can safely ignore this email.
                No action is required.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8f9fa;padding:16px 32px;border-top:1px solid #e8ecf0;">
              <p style="margin:0;font-size:11px;color:#aaa;text-align:center;">
                Briya Public Charter School · Room Reservation System
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
