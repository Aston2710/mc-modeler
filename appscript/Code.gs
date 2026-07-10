/**
 * MC Modeler — emisor de notificaciones por correo.
 *
 * Recibe POSTs del trigger de Supabase (pg_net sobre notification_outbox),
 * envía el correo con GmailApp y marca la fila como enviada vía REST.
 * retryUnsent() (time-trigger cada 15 min) repesca filas no enviadas.
 *
 * Copia de referencia — la versión viva se despliega en script.google.com
 * con la cuenta emisora (modeler.notifications@gmail.com). Ver README.md.
 *
 * Script Properties requeridas:
 *   SECRET        — mismo valor que private.notification_config.secret
 *   SUPABASE_URL  — https://<ref>.supabase.co
 *   SERVICE_KEY   — service_role key del proyecto
 *   BASE_URL      — URL pública de la app (sin slash final)
 *   SENDER_NAME   — nombre visible del remitente (ej. "MC Modeler")
 */

var PROPS = PropertiesService.getScriptProperties()

function doPost(e) {
  var data
  try {
    data = JSON.parse(e.postData.contents)
  } catch (err) {
    return json_({ ok: false, error: 'bad json' })
  }
  if (!data.secret || data.secret !== PROPS.getProperty('SECRET')) {
    return json_({ ok: false, error: 'unauthorized' })
  }
  var ok = sendRow_(data)
  return json_({ ok: ok })
}

/**
 * Time-trigger (cada 15 min): procesa filas sin sent_at de los últimos 2 días.
 * Sirve dos caminos:
 *   - Reintentos del modo inmediato (POSTs que fallaron).
 *   - Batching del modo digest (el trigger no envió nada; aquí se agrupa).
 * Agrupa por destinatario: 1 fila → correo individual; 2+ → un solo digest.
 * Respeta las preferencias por usuario (en digest el trigger no las filtró).
 */
function retryUnsent() {
  var since = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString()
  var rows = sbFetch_(
    '/rest/v1/notification_outbox' +
      '?sent_at=is.null&attempts=lt.5&created_at=gte.' + since +
      '&order=created_at.asc&limit=100',
    'get',
    null
  )
  if (!rows || !rows.length) return

  var byRecipient = {}
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i]
    if (!byRecipient[r.recipient_email]) byRecipient[r.recipient_email] = []
    byRecipient[r.recipient_email].push(r)
  }

  for (var email in byRecipient) {
    var group = byRecipient[email]
    var prefs = getPrefs_(group[0].recipient_id)
    var toSend = []
    for (var j = 0; j < group.length; j++) {
      if (prefAllows_(prefs, group[j].kind)) {
        toSend.push(group[j])
      } else {
        // Suprimido por preferencias: marcar enviado para que no reintente.
        patchRow_(group[j].id, { sent_at: new Date().toISOString(), error: 'suppressed by prefs' })
      }
    }
    if (toSend.length === 1) sendRow_(toSend[0])
    else if (toSend.length > 1) sendDigest_(email, toSend)
  }
}

function prefAllows_(prefs, kind) {
  if (!prefs) return true // sin fila = todo activado (default)
  if (!prefs.email_enabled) return false
  if ((kind === 'invite_redeemed_diagram' || kind === 'invite_redeemed_project') && !prefs.invite_events) return false
  if (kind === 'comment_mention' && !prefs.mention_events) return false
  return true
}

function getPrefs_(userId) {
  if (!userId) return null
  var rows = sbFetch_(
    '/rest/v1/notification_prefs?user_id=eq.' + userId +
      '&select=email_enabled,invite_events,mention_events',
    'get',
    null
  )
  return rows && rows.length ? rows[0] : null
}

function sendDigest_(email, rows) {
  try {
    var mail = buildDigest_(rows)
    GmailApp.sendEmail(email, mail.subject, mail.text, {
      htmlBody: mail.html,
      name: PROPS.getProperty('SENDER_NAME') || 'MC Modeler',
    })
    var now = new Date().toISOString()
    for (var i = 0; i < rows.length; i++) patchRow_(rows[i].id, { sent_at: now, error: null })
  } catch (err) {
    for (var k = 0; k < rows.length; k++) {
      patchRow_(rows[k].id, { error: String(err), attempts: (rows[k].attempts || 0) + 1 })
    }
  }
}

function buildDigest_(rows) {
  var base = PROPS.getProperty('BASE_URL') || ''
  var lines = []
  var htmlItems = []
  for (var i = 0; i < rows.length; i++) {
    var m = buildEmail_(rows[i].kind, rows[i].payload || {})
    if (!m) continue
    var p = rows[i].payload || {}
    var url = base
    if (p.diagramId) {
      url = base + '/?d=' + encodeURIComponent(p.diagramId)
      if (p.threadId) url += '&thread=' + encodeURIComponent(p.threadId)
    }
    lines.push('• ' + m.subject)
    htmlItems.push(
      '<li style="margin:7px 0"><a href="' + url +
        '" style="color:#374151;text-decoration:none">' + esc_(m.subject) + '</a></li>'
    )
  }
  var n = rows.length
  return {
    subject: 'Tienes ' + n + ' notificaciones nuevas en MC Modeler',
    text: 'Tienes ' + n + ' notificaciones nuevas:\n\n' + lines.join('\n') + '\n\n' + base,
    html: layout_(
      'Tienes ' + n + ' notificaciones nuevas',
      '<ul style="padding-left:18px;margin:0">' + htmlItems.join('') + '</ul>',
      base,
      'Abrir MC Modeler'
    ),
  }
}

// ── Envío ────────────────────────────────────────────────────────────────────

function sendRow_(row) {
  try {
    var mail = buildEmail_(row.kind, row.payload || {})
    if (!mail) {
      patchRow_(row.id, { sent_at: new Date().toISOString(), error: 'kind desconocido' })
      return false
    }
    GmailApp.sendEmail(row.recipient_email, mail.subject, mail.text, {
      htmlBody: mail.html,
      name: PROPS.getProperty('SENDER_NAME') || 'MC Modeler',
    })
    patchRow_(row.id, { sent_at: new Date().toISOString(), error: null })
    return true
  } catch (err) {
    patchRow_(row.id, { error: String(err), attempts: (row.attempts || 0) + 1 })
    return false
  }
}

// ── Plantillas (ES) ──────────────────────────────────────────────────────────

function buildEmail_(kind, p) {
  var base = PROPS.getProperty('BASE_URL') || ''
  if (kind === 'invite_redeemed_diagram') {
    var dUrl = base + '/?d=' + encodeURIComponent(p.diagramId || '')
    return {
      subject: p.actorName + ' se unió a «' + p.diagramName + '»',
      text:
        p.actorName + ' (' + (p.actorEmail || '') + ') se unió al diagrama «' +
        p.diagramName + '» mediante un enlace de invitación (rol: ' + roleEs_(p.role) + ').\n\n' +
        'Abrir diagrama: ' + dUrl,
      html: layout_(
        'Nuevo colaborador en «' + esc_(p.diagramName) + '»',
        '<p><strong>' + esc_(p.actorName) + '</strong> (' + esc_(p.actorEmail || '') +
          ') se unió al diagrama mediante un enlace de invitación con rol de <strong>' +
          roleEs_(p.role) + '</strong>.</p>',
        dUrl, 'Abrir diagrama'
      ),
    }
  }
  if (kind === 'invite_redeemed_project') {
    return {
      subject: p.actorName + ' se unió al proyecto «' + p.projectName + '»',
      text:
        p.actorName + ' (' + (p.actorEmail || '') + ') se unió al proyecto «' +
        p.projectName + '» mediante un enlace de invitación (rol: ' + roleEs_(p.role) + ').\n\n' +
        'Abrir MC Modeler: ' + base,
      html: layout_(
        'Nuevo colaborador en el proyecto «' + esc_(p.projectName) + '»',
        '<p><strong>' + esc_(p.actorName) + '</strong> (' + esc_(p.actorEmail || '') +
          ') se unió al proyecto mediante un enlace de invitación con rol de <strong>' +
          roleEs_(p.role) + '</strong>.</p>',
        base, 'Abrir MC Modeler'
      ),
    }
  }
  if (kind === 'comment_mention') {
    var mUrl = base + '/?d=' + encodeURIComponent(p.diagramId || '')
    if (p.threadId) mUrl += '&thread=' + encodeURIComponent(p.threadId)
    var where = p.elementLabel ? ' (elemento: ' + p.elementLabel + ')' : ''
    return {
      subject: p.actorName + ' te mencionó en «' + p.diagramName + '»',
      text:
        p.actorName + ' te mencionó en un comentario del diagrama «' + p.diagramName +
        '»' + where + ':\n\n"' + (p.excerpt || '') + '"\n\n' +
        'Abrir diagrama: ' + mUrl,
      html: layout_(
        esc_(p.actorName) + ' te mencionó en «' + esc_(p.diagramName) + '»',
        (p.elementLabel
          ? '<p style="color:#6b7280;font-size:13px;margin:0 0 8px">Elemento: ' + esc_(p.elementLabel) + '</p>'
          : '') +
          '<blockquote style="margin:0;padding:10px 14px;border-left:3px solid #8b5cf6;background:#f5f3ff;border-radius:4px;color:#374151">' +
          esc_(p.excerpt || '') + '</blockquote>',
        mUrl, 'Ver comentario'
      ),
    }
  }
  return null
}

function layout_(title, bodyHtml, url, cta) {
  var base = PROPS.getProperty('BASE_URL') || ''
  return (
    '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">' +
    '<h2 style="font-size:17px;color:#111827;margin:0 0 14px">' + title + '</h2>' +
    '<div style="font-size:14px;color:#374151;line-height:1.5">' + bodyHtml + '</div>' +
    (url
      ? '<p style="margin:22px 0"><a href="' + url + '" style="background:#8b5cf6;color:#fff;' +
        'padding:9px 18px;border-radius:6px;text-decoration:none;font-size:13px">' + cta + '</a></p>'
      : '') +
    '<p style="font-size:11px;color:#9ca3af;margin-top:26px;border-top:1px solid #e5e7eb;padding-top:10px">' +
    'Notificación automática de MC Modeler. ' +
    (base ? 'Gestiona tus notificaciones en <a href="' + base + '" style="color:#9ca3af">la aplicación</a>.' : '') +
    '</p>' +
    '</div>'
  )
}

function roleEs_(role) {
  return role === 'editor' ? 'editor' : role === 'viewer' ? 'lector' : (role || '')
}

function esc_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ── Supabase REST (service key) ──────────────────────────────────────────────

function sbFetch_(path, method, body) {
  var url = PROPS.getProperty('SUPABASE_URL') + path
  var key = PROPS.getProperty('SERVICE_KEY')
  var res = UrlFetchApp.fetch(url, {
    method: method,
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      Prefer: 'return=minimal',
    },
    contentType: 'application/json',
    payload: body ? JSON.stringify(body) : undefined,
    muteHttpExceptions: true,
  })
  if (res.getResponseCode() >= 300) {
    console.error('Supabase ' + method + ' ' + path + ' → ' + res.getResponseCode() + ': ' + res.getContentText())
    return null
  }
  var text = res.getContentText()
  return text ? JSON.parse(text) : []
}

function patchRow_(id, patch) {
  sbFetch_('/rest/v1/notification_outbox?id=eq.' + id, 'patch', patch)
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)
}
