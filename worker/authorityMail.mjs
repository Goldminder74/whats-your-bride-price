import { prepareAuthorityAlert } from './driveOAuth.mjs';

/** Fixed provider/recipient, TLS from the first byte. No provider response, password,
 * SQL or operation identity is returned. Email delivery is not exactly once: an
 * ambiguous final acknowledgement must be reconciled, never blindly retried. */
export function authorityMail(env,connect,options){const send=privateEmailTransport(env,connect,options);return event=>send(prepareAuthorityAlert(event));}
export function privateEmailTransport(env, connect, { timeoutMs = 15000 } = {}) {
  if (env.WYBP_ALERT_SENDER !== 'noreply@classesforculture.com' || env.WYBP_SMTP_USERNAME !== env.WYBP_ALERT_SENDER || typeof env.WYBP_SMTP_PASSWORD !== 'string' || !env.WYBP_SMTP_PASSWORD) throw Error('alert_transport_configuration');
  return tlsSmtpTransport({sender:env.WYBP_ALERT_SENDER,username:env.WYBP_SMTP_USERNAME,password:env.WYBP_SMTP_PASSWORD,hostname:'mail.privateemail.com',ehlo:'wybp-recovery-info.netlify.app'},connect,{timeoutMs});
}

// Customer mail has a separate, explicitly selected provider. Never fall back to
// the legacy mailbox after a Google failure or change the operational-alert route.
export function purchaseEmailTransport(env,connect,options){
  if(env.WYBP_PURCHASE_MAIL_PROVIDER===undefined||env.WYBP_PURCHASE_MAIL_PROVIDER==='privateemail')return privateEmailTransport(env,connect,options);
  if(env.WYBP_PURCHASE_MAIL_PROVIDER!=='google-workspace-relay'||env.WYBP_PURCHASE_MAIL_SENDER!=='receipts@mail.classesforculture.com'||env.WYBP_PURCHASE_MAIL_USERNAME!=='backup-operator@classesforculture.com'||typeof env.WYBP_PURCHASE_MAIL_PASSWORD!=='string'||!env.WYBP_PURCHASE_MAIL_PASSWORD||env.WYBP_PURCHASE_MAIL_PASSWORD.length>512||/[\r\n\0]/.test(env.WYBP_PURCHASE_MAIL_PASSWORD))throw Error('purchase_mail_transport_configuration');
  return tlsSmtpTransport({sender:env.WYBP_PURCHASE_MAIL_SENDER,username:env.WYBP_PURCHASE_MAIL_USERNAME,password:env.WYBP_PURCHASE_MAIL_PASSWORD,hostname:'smtp-relay.gmail.com',ehlo:'mail.classesforculture.com'},connect,options);
}

// Only the two fixed configurations above can construct this transport. Neither
// a request nor an environment variable can choose a host, port or TLS policy.
function tlsSmtpTransport({sender,username,password,hostname,ehlo},connect,{timeoutMs=15000}={}){
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('mail_transport_configuration');
  return async mail => {
    if(typeof mail?.to!=='string'||mail.to.length>254||!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(mail.to)||typeof mail.subject!=='string'||!/^[\x20-\x7e]{1,160}$/.test(mail.subject)||typeof mail.body!=='string'||!mail.body||Buffer.byteLength(mail.body)>65536)throw Error('mail_content_unavailable');
    let socket, reader, writer, timer, dataAttempted = false;
    try {
      socket = connect({ hostname, port: 465 }, { secureTransport: 'on' });
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
        await command('EHLO '+ehlo,250);
        await command('AUTH PLAIN '+Buffer.from('\0'+username+'\0'+password).toString('base64'),235);
        await command('MAIL FROM:<'+sender+'>',250);
        await command('RCPT TO:<'+mail.to+'>',250);
        await command('DATA',354);
        const body = 'From: '+sender+'\r\nTo: '+mail.to+'\r\nSubject: '+mail.subject+'\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n'+Buffer.from(mail.body).toString('base64').match(/.{1,76}/g).join('\r\n')+'\r\n.\r\n';
        // A rejected/partial write may already have delivered DATA's terminator.
        // Mark ambiguity BEFORE writing, not only after the local promise resolves.
        dataAttempted = true;
        await writer.write(new TextEncoder().encode(body));
        await reply(250);
        return { accepted: true, receiptVerified: false };
      };
      return await Promise.race([work(), new Promise((_,reject) => { timer=setTimeout(()=>reject(Error('alert_transport_timeout')),timeoutMs); })]);
    } catch { throw Error(dataAttempted ? 'alert_delivery_uncertain' : 'alert_transport_unavailable'); }
    finally { clearTimeout(timer); if(socket) await socket.close().catch(()=>{}); }
  };
}
