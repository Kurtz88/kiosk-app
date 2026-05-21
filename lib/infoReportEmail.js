/**
 * 틀린정보 신고 접수 시 이메일 알림 (Gmail SMTP)
 *
 * Vercel Environment Variables (이름 중 하나만 맞으면 됨):
 *   수신: KIOSK_INFO_REPORT_NOTIFY_EMAIL  (기본 ini0330@gmail.com)
 *   호스트: KIOSK_SMTP_HOST  (없으면 smtp.gmail.com)
 *   포트: KIOSK_SMTP_PORT  (기본 587)
 *   계정: KIOSK_SMTP_USER | GMAIL_USER | SMTP_USER | GOOGLE_EMAIL
 *   비밀번호: KIOSK_SMTP_PASS | GMAIL_APP_PASSWORD | GMAIL_PASSWORD | SMTP_PASS | GOOGLE_APP_PASSWORD
 *   발신 표시: KIOSK_SMTP_FROM (선택)
 */
const nodemailer = require('nodemailer');

const DEFAULT_MAIL_ACCOUNT = 'ini0330@gmail.com';
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

    pass = normalizeSmtpPass(pass);
    if (!pass) return null;

    let host = firstEnv([
        'KIOSK_SMTP_HOST',
        'IOSK_SMTP_HOST', /* Vercel 오타 대비 */
        'SMTP_HOST',
        'GMAIL_SMTP_HOST',
    ]);
    if (!host) host = 'smtp.gmail.com';

    const portRaw = firstEnv(['KIOSK_SMTP_PORT', 'SMTP_PORT', 'GMAIL_SMTP_PORT']);
    const port = portRaw ? parseInt(portRaw, 10) || 587 : 587;

    const from =
        firstEnv(['KIOSK_SMTP_FROM', 'SMTP_FROM', 'GMAIL_FROM', 'EMAIL_FROM']) ||
        `키오스크 <${user}>`;

    return { host, port, user, pass, from };
}

/** Gmail 앱 비밀번호 — 공백 제거, 값에 변수명이 붙어 붙은 경우 제거 */
function normalizeSmtpPass(raw) {
    let s = String(raw || '').trim();
    s = s.replace(/KIOSK_SMTP_PASS/gi, '').trim();
    s = s.replace(/\s+/g, '');
    return s;
}

function isInfoReportEmailConfigured() {
    return resolveSmtpConfig() != null;
}

function createSmtpTransport(cfg) {
    const auth = { user: cfg.user, pass: cfg.pass };
    if (/gmail\.com/i.test(cfg.host) || /@gmail\.com$/i.test(cfg.user)) {
        return nodemailer.createTransport({
            service: 'gmail',
            auth,
        });
    }
    const secure = cfg.port === 465;
    return nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure,
        requireTLS: !secure,
        auth,
        connectionTimeout: 20000,
        greetingTimeout: 20000,
        socketTimeout: 25000,
    });
}

const MAIL_LOG_TAG = '[kiosk-mail]';
/** Vercel 로그용 — 신고 본문·메일 본문 미리보기 최대 길이 */
const MAIL_LOG_REPORT_MSG_MAX = 500;
const MAIL_LOG_BODY_PREVIEW_MAX = 800;

function mailRuntimeMeta() {
    return {
        vercel: process.env.VERCEL === '1',
        vercelEnv: process.env.VERCEL_ENV || null,
        region: process.env.VERCEL_REGION || null,
        at: new Date().toISOString(),
    };
}

function truncateForMailLog(text, maxLen) {
    const raw = String(text || '');
    if (raw.length <= maxLen) {
        return { text: raw, length: raw.length, truncated: false };
    }
    return { text: raw.slice(0, maxLen) + '…(이하 생략)', length: raw.length, truncated: true };
}

/**
 * 메일에 실릴 내용 요약 (Vercel Logs — 비밀번호 등 민감 정보 없음)
 * @param {{ reportId?: number, restaurantId?: number|null, restaurantName?: string, message?: string, createdAt?: string }} payload
 * @param {{ subject: string, text: string, bodyText: string, storeName: string }} built
 */
function summarizeSentMailContent(payload, built) {
    const reportMsg = truncateForMailLog(built.bodyText, MAIL_LOG_REPORT_MSG_MAX);
    const bodyPreview = truncateForMailLog(built.text, MAIL_LOG_BODY_PREVIEW_MAX);
    return {
        subject: built.subject,
        storeName: built.storeName,
        createdAt: payload && payload.createdAt ? String(payload.createdAt) : null,
        reportMessage: reportMsg.text,
        reportMessageLength: reportMsg.length,
        reportMessageTruncated: reportMsg.truncated,
        emailBodyPreview: bodyPreview.text,
        emailBodyPreviewTruncated: bodyPreview.truncated,
    };
}

/** @param {{ reportId?: number, restaurantId?: number|null, restaurantName?: string, message?: string, createdAt?: string }} payload */
function mailPayloadContext(payload) {
    return {
        reportId: payload && payload.reportId != null ? payload.reportId : null,
        restaurantId: payload && payload.restaurantId != null ? payload.restaurantId : null,
        restaurantName: payload && payload.restaurantName ? String(payload.restaurantName) : null,
        isTestMail: !!(payload && payload.reportId === 0),
    };
}

function logMailJson(level, emoji, event, fields) {
    const line = `${MAIL_LOG_TAG} ${emoji} ${event} ${JSON.stringify({ ...mailRuntimeMeta(), ...fields })}`;
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
}

function logMailSuccess(ctx, details) {
    logMailJson('log', '✅', '메일 발송 성공', { ...ctx, ...details });
}

function logMailFailure(ctx, err, extra) {
    const e = err || {};
    logMailJson('error', '❌', '메일 발송 실패', {
        ...ctx,
        ...extra,
        errorMessage: e.message ? String(e.message) : String(err),
        errorCode: e.code != null ? String(e.code) : null,
        responseCode: e.responseCode != null ? e.responseCode : null,
        smtpResponse: e.response != null ? String(e.response).slice(0, 500) : null,
    });
}

function logMailSkipped(ctx, reason, extra) {
    logMailJson('warn', '⏭️', '메일 발송 생략', { ...ctx, reason, ...extra });
}

function logSmtpStatusOnBoot() {
    const cfg = resolveSmtpConfig();
    if (cfg) {
        logMailJson('log', 'ℹ️', 'SMTP 설정 확인(기동)', {
            smtpHost: cfg.host,
            smtpPort: cfg.port,
            smtpUser: cfg.user,
            notifyTo: getNotifyEmail(),
            configured: true,
        });
    } else if (process.env.VERCEL === '1') {
        logMailSkipped(
            { reportId: null, restaurantId: null, restaurantName: null, isTestMail: false },
            'SMTP 환경 변수 없음 (KIOSK_SMTP_USER + KIOSK_SMTP_PASS 등)',
            { configured: false }
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
 * @returns {Promise<{ ok: boolean, skipped?: boolean, error?: string, messageId?: string, to?: string, subject?: string }>}
 */
async function sendInfoReportEmail(payload) {
    const ctx = mailPayloadContext(payload);
    const built = buildInfoReportMailContent(payload);
    const sentContent = summarizeSentMailContent(payload, built);
    const cfg = resolveSmtpConfig();
    if (!cfg) {
        logMailSkipped(ctx, 'SMTP 계정/비밀번호 환경 변수 없음', {
            needEnv: 'KIOSK_SMTP_USER + KIOSK_SMTP_PASS (또는 GMAIL_USER + GMAIL_APP_PASSWORD)',
            wouldHaveSent: sentContent,
        });
        return { ok: false, skipped: true, reason: 'smtp_not_configured' };
    }

    const to = getNotifyEmail();
    const { subject, text, html } = built;

    try {
        const transport = createSmtpTransport(cfg);
        await transport.verify();
        const info = await transport.sendMail({
            from: cfg.from,
            to,
            subject,
            text,
            html,
        });
        const messageId = info && info.messageId ? String(info.messageId) : null;
        logMailSuccess(ctx, {
            messageId,
            from: cfg.from,
            to,
            smtpHost: cfg.host,
            smtpPort: cfg.port,
            smtpUser: cfg.user,
            accepted: info && info.accepted ? info.accepted : undefined,
            response: info && info.response ? String(info.response).slice(0, 300) : undefined,
            sentContent,
        });
        return { ok: true, messageId, to, subject };
    } catch (err) {
        const msg = err && err.message ? String(err.message) : String(err);
        logMailFailure(ctx, err, {
            from: cfg.from,
            to,
            smtpHost: cfg.host,
            smtpPort: cfg.port,
            smtpUser: cfg.user,
            wouldHaveSent: sentContent,
        });
        return {
            ok: false,
            error: msg,
            code: err && err.code ? String(err.code) : undefined,
        };
    }
}

const PASS_ENV_KEYS = [
    'KIOSK_SMTP_PASS',
    'GMAIL_APP_PASSWORD',
    'GMAIL_PASSWORD',
    'SMTP_PASS',
    'SMTP_PASSWORD',
    'GOOGLE_APP_PASSWORD',
];

const USER_ENV_KEYS = ['KIOSK_SMTP_USER', 'GMAIL_USER', 'SMTP_USER', 'GOOGLE_EMAIL', 'EMAIL_USER'];

function getSmtpEnvDiagnostics() {
    const missing = [];
    if (!firstEnv(PASS_ENV_KEYS)) missing.push('SMTP 비밀번호 (KIOSK_SMTP_PASS 등)');
    if (!firstEnv(USER_ENV_KEYS) && !DEFAULT_MAIL_ACCOUNT) missing.push('SMTP 계정');
    const vercelEnv = process.env.VERCEL_ENV || (process.env.VERCEL === '1' ? 'production' : 'local');
    let hint = '';
    if (process.env.VERCEL === '1' && missing.length) {
        hint =
            'Vercel: Production(실제 사이트)에 KIOSK_SMTP_* 4개 모두 필요. IOSK_SMTP_HOST 는 오타 → KIOSK_SMTP_HOST 로 수정. 변경 후 Redeploy';
    }
    return { missing, vercelEnv, hint };
}

function getInfoReportMailStatus() {
    const cfg = resolveSmtpConfig();
    const diag = getSmtpEnvDiagnostics();
    const passRaw = firstEnv(PASS_ENV_KEYS);
    const passNorm = passRaw ? normalizeSmtpPass(passRaw) : '';
    let hint = diag.hint;
    if (cfg && passNorm && !/^[a-z]{16}$/i.test(passNorm)) {
        hint =
            (hint ? hint + ' ' : '') +
            `앱 비밀번호는 공백 없이 16자만 입력하세요(현재 ${passNorm.length}자). 값 끝에 "KIOSK_SMTP_PASS" 같은 글자가 붙지 않았는지 확인.`;
    }
    return {
        configured: !!cfg,
        notifyEmail: getNotifyEmail(),
        smtpHost: cfg ? cfg.host : null,
        smtpUser: cfg ? cfg.user : null,
        passLength: passNorm.length,
        passLooksLikeGmailApp: /^[a-z]{16}$/i.test(passNorm),
        missing: diag.missing,
        vercelEnv: diag.vercelEnv,
        hint,
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
