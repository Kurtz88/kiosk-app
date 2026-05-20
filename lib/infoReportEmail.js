/**
 * 틀린정보 신고 접수 시 이메일 알림 (Gmail SMTP)
 *
 * Vercel Environment Variables (이름 중 하나만 맞으면 됨):
 *   수신: KIOSK_INFO_REPORT_NOTIFY_EMAIL  (기본 elysia0419@gmail.com)
 *   호스트: KIOSK_SMTP_HOST  (없으면 smtp.gmail.com)
 *   포트: KIOSK_SMTP_PORT  (기본 587)
 *   계정: KIOSK_SMTP_USER | GMAIL_USER | SMTP_USER | GOOGLE_EMAIL
 *   비밀번호: KIOSK_SMTP_PASS | GMAIL_APP_PASSWORD | GMAIL_PASSWORD | SMTP_PASS | GOOGLE_APP_PASSWORD
 *   발신 표시: KIOSK_SMTP_FROM (선택)
 */
const nodemailer = require('nodemailer');

const DEFAULT_MAIL_ACCOUNT = 'elysia0419@gmail.com';
const DEFAULT_NOTIFY_EMAIL = DEFAULT_MAIL_ACCOUNT;

function firstEnv(keys) {
    for (let i = 0; i < keys.length; i++) {
        const v = process.env[keys[i]];
        if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
}

function getNotifyEmail() {
    const fromEnv = firstEnv(['KIOSK_INFO_REPORT_NOTIFY_EMAIL', 'INFO_REPORT_EMAIL', 'NOTIFY_EMAIL']);
    return fromEnv || DEFAULT_NOTIFY_EMAIL;
}

/** @returns {{ host: string, port: number, user: string, pass: string, from: string } | null} */
function resolveSmtpConfig() {
    let user = firstEnv([
        'KIOSK_SMTP_USER',
        'GMAIL_USER',
        'SMTP_USER',
        'GOOGLE_EMAIL',
        'EMAIL_USER',
    ]);
    let pass = firstEnv([
        'KIOSK_SMTP_PASS',
        'GMAIL_APP_PASSWORD',
        'GMAIL_PASSWORD',
        'SMTP_PASS',
        'SMTP_PASSWORD',
        'GOOGLE_APP_PASSWORD',
        'GOOGLE_PASSWORD',
    ]);
    if (!pass) return null;
    if (!user) user = DEFAULT_MAIL_ACCOUNT;

    pass = pass.replace(/\s+/g, '');

    let host = firstEnv(['KIOSK_SMTP_HOST', 'SMTP_HOST', 'GMAIL_SMTP_HOST']);
    if (!host) host = 'smtp.gmail.com';

    const portRaw = firstEnv(['KIOSK_SMTP_PORT', 'SMTP_PORT', 'GMAIL_SMTP_PORT']);
    const port = portRaw ? parseInt(portRaw, 10) || 587 : 587;

    const from =
        firstEnv(['KIOSK_SMTP_FROM', 'SMTP_FROM', 'GMAIL_FROM', 'EMAIL_FROM']) ||
        `키오스크 <${user}>`;

    return { host, port, user, pass, from };
}

function isInfoReportEmailConfigured() {
    return resolveSmtpConfig() != null;
}

function createSmtpTransport(cfg) {
    const secure = cfg.port === 465;
    return nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure,
        requireTLS: !secure,
        auth: {
            user: cfg.user,
            pass: cfg.pass,
        },
        connectionTimeout: 20000,
        greetingTimeout: 20000,
        socketTimeout: 25000,
    });
}

function logSmtpStatusOnBoot() {
    const cfg = resolveSmtpConfig();
    if (cfg) {
        console.log(
            `[kiosk] 틀린정보 메일: 활성 (${cfg.host}:${cfg.port}, 발신 ${cfg.user} → 수신 ${getNotifyEmail()})`
        );
    } else if (process.env.VERCEL === '1') {
        console.warn(
            '[kiosk] 틀린정보 메일: 비활성 — Vercel에 GMAIL_USER+GMAIL_APP_PASSWORD 또는 KIOSK_SMTP_USER+KIOSK_SMTP_PASS 설정'
        );
    }
}

logSmtpStatusOnBoot();

/**
 * @param {{ reportId: number, restaurantId: number|null, restaurantName: string, message: string, createdAt: string }} payload
 * @returns {Promise<{ ok: boolean, skipped?: boolean, error?: string }>}
 */
function buildInfoReportMailContent(payload) {
    const { reportId, restaurantId, restaurantName, message, createdAt } = payload;
    const storeName = String(restaurantName || '').trim() || '(업소명 없음)';
    const bodyText = String(message || '').trim() || '(내용 없음)';
    const when = createdAt || new Date().toISOString();

    const subject = `[키오스크 틀린정보] ${storeName}`;

    const text = [
        '키오스크에서 틀린정보 신고가 접수되었습니다.',
        '',
        `업소명: ${storeName}`,
        '',
        '내용:',
        bodyText,
        '',
        '---',
        `신고 번호: ${reportId}`,
        restaurantId != null ? `식당 ID: ${restaurantId}` : '',
        `접수 시각: ${when}`,
    ]
        .filter((line) => line !== '')
        .join('\n');

    const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"></head><body style="font-family:Malgun Gothic,sans-serif;line-height:1.6;color:#222;">
<p>키오스크에서 <strong>틀린정보 신고</strong>가 접수되었습니다.</p>
<table style="border-collapse:collapse;margin:16px 0;">
<tr><td style="padding:8px 12px;background:#f1f3f5;font-weight:700;vertical-align:top;">업소명</td>
<td style="padding:8px 12px;border:1px solid #dee2e6;">${escapeHtml(storeName)}</td></tr>
<tr><td style="padding:8px 12px;background:#f1f3f5;font-weight:700;vertical-align:top;">내용</td>
<td style="padding:8px 12px;border:1px solid #dee2e6;white-space:pre-wrap;">${escapeHtml(bodyText)}</td></tr>
</table>
<p style="font-size:12px;color:#868e96;">신고 #${escapeHtml(String(reportId))}${restaurantId != null ? ` · 식당 ID ${escapeHtml(String(restaurantId))}` : ''}<br>${escapeHtml(when)}</p>
</body></html>`;

    return { subject, text, html, storeName, bodyText };
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * @param {{ reportId: number, restaurantId: number|null, restaurantName: string, message: string, createdAt: string }} payload
 * @returns {Promise<{ ok: boolean, skipped?: boolean, error?: string }>}
 */
async function sendInfoReportEmail(payload) {
    const cfg = resolveSmtpConfig();
    if (!cfg) {
        console.warn(
            '[kiosk] 틀린정보 메일 생략: SMTP 계정/비밀번호 환경 변수 없음 (KIOSK_SMTP_* 또는 GMAIL_USER+GMAIL_APP_PASSWORD)'
        );
        return { ok: false, skipped: true };
    }

    const to = DEFAULT_NOTIFY_EMAIL;
    const { subject, text, html } = buildInfoReportMailContent(payload);

    try {
        const transport = createSmtpTransport(cfg);
        await transport.sendMail({
            from: cfg.from,
            to,
            subject,
            text,
            html,
        });
        console.log(
            '[kiosk] 틀린정보 메일 발송 완료 →',
            to,
            `업소명=${payload.restaurantName}`,
            `(신고 #${payload.reportId})`
        );
        return { ok: true };
    } catch (err) {
        const msg = err && err.message ? String(err.message) : String(err);
        console.error('[kiosk] 틀린정보 메일 발송 실패:', msg);
        return { ok: false, error: msg };
    }
}

function getInfoReportMailStatus() {
    const cfg = resolveSmtpConfig();
    return {
        configured: !!cfg,
        notifyEmail: getNotifyEmail(),
        smtpHost: cfg ? cfg.host : null,
        smtpUser: cfg ? cfg.user : null,
    };
}

/** 관리자 메일 연결 테스트 */
async function sendInfoReportTestEmail() {
    const now = new Date().toISOString();
    return sendInfoReportEmail({
        reportId: 0,
        restaurantId: null,
        restaurantName: '[메일 테스트] 키오스크',
        message: '관리자 화면에서 보낸 테스트 메일입니다. 이 메일이 보이면 SMTP 설정이 정상입니다.',
        createdAt: now,
    });
}

module.exports = {
    getNotifyEmail,
    isInfoReportEmailConfigured,
    getInfoReportMailStatus,
    resolveSmtpConfig,
    sendInfoReportEmail,
    sendInfoReportTestEmail,
};
