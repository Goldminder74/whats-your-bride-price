import { prepareAuthorityAlert } from './driveOAuth.mjs';

/** Fixed provider/recipient, TLS from the first byte. No provider response, password,
 * SQL or operation identity is returned. Email delivery is not exactly once: an
 * ambiguous final acknowledgement must be reconciled, never blindly retried. */
export function authorityMail(env, connect, { timeoutMs = 15000 } = {}) {
  if (env.WYBP_ALERT_SENDER !== 'noreply@classesforculture.com' || env.WYBP_SMTP_USERNAME !== env.WYBP_ALERT_SENDER || typeof env.WYBP_SMTP_PASSWORD !== 'string' || !env.WYBP_SMTP_PASSWORD) throw Error('alert_transport_configuration');
  return async event => {
    const mail = prepareAuthorityAlert(event);
    let socket, reader, writer, timer, accepted = false;
    try {
      socket = connect({ hostname: 'mail.privateemail.com', port: 465 }, { secureTransport: 'on' });
      const work = async () => {
        await socket.opened;
        reader = socket.readable.getReader(); writer = socket.writable.getWriter();
        let buffer = ''; const decoder = new TextDecoder();
        async function reply(expected) {
          let code, lines = 0;
          for (;;) {
            while (!buffer.includes('\r\n')) {
              const row = await reader.read();
              if (row.done) throw Error('alert_transport_closed');
              buffer += decoder.decode(row.value, { stream: true });
              if (buffer.length > 8192) throw Error('alert_reply_bounds');
            }
            const end = buffer.indexOf('\r\n'), line = buffer.slice(0,end); buffer = buffer.slice(end+2);
            const match = /^(\d{3})([- ])/.exec(line);
            if (!match || ++lines > 100 || (code && code !== match[1])) throw Error('alert_reply_invalid');
            code = match[1];
            if (match[2] === ' ') { if (Number(code) !== expected) throw Error('alert_transport_rejected'); return; }
          }
        }
        async function command(value, expected) { await writer.write(new TextEncoder().encode(value+'\r\n')); await reply(expected); }
        await reply(220);
        await command('EHLO wybp-recovery-info.netlify.app',250);
        await command('AUTH PLAIN '+Buffer.from('\0'+env.WYBP_SMTP_USERNAME+'\0'+env.WYBP_SMTP_PASSWORD).toString('base64'),235);
        await command('MAIL FROM:<'+env.WYBP_ALERT_SENDER+'>',250);
        await command('RCPT TO:<'+mail.to+'>',250);
        await command('DATA',354);
        const body = 'From: '+env.WYBP_ALERT_SENDER+'\r\nTo: '+mail.to+'\r\nSubject: '+mail.subject+'\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n'+mail.body+'\r\n.\r\n';
        await writer.write(new TextEncoder().encode(body));
        accepted = true; // After DATA, a disconnect/timeout is an uncertain send.
        await reply(250);
        return { accepted: true, receiptVerified: false };
      };
      return await Promise.race([work(), new Promise((_,reject) => { timer=setTimeout(()=>reject(Error('alert_transport_timeout')),timeoutMs); })]);
    } catch { throw Error(accepted ? 'alert_delivery_uncertain' : 'alert_transport_unavailable'); }
    finally { clearTimeout(timer); if(socket) await socket.close().catch(()=>{}); }
  };
}
