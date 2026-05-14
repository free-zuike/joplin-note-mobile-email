// Cloudflare Worker 版本的 Resend 代理
// 部署到 https://workers.cloudflare.com/ 可获得免费 HTTPS

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  // 处理 CORS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Credentials': 'true',
      },
    })
  }

  // 只允许 POST 请求到 /emails
  if (request.method !== 'POST' || new URL(request.url).pathname !== '/emails') {
    return new Response(JSON.stringify({ error: 'Not found. Use POST /emails.' }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  try {
    const payload = await request.json()

    // 验证必需字段
    const { apiKey, from, to, subject, html, attachments } = payload
    if (!from || !to || !subject || !html) {
      return new Response(JSON.stringify({ error: 'Missing required fields: from, to, subject, html.' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    console.log('代理收到请求', {
      from,
      to,
      subject,
      htmlLength: html?.length,
      attachmentsLength: attachments?.length || 0,
      attachmentsKeys: attachments?.map(att => Object.keys(att))
    })

    const resendPayload = { from, to, subject, html }
    if (attachments && attachments.length > 0) {
      resendPayload.attachments = attachments
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(resendPayload),
    })

    const responseBody = await resendResponse.text()
    if (!resendResponse.ok) {
      return new Response(JSON.stringify({
        error: 'Resend API 返回错误',
        status: resendResponse.status,
        resendResponse: responseBody,
        payloadSummary: {
          from,
          to,
          subject,
          htmlLength: html?.length,
          attachmentsLength: attachments?.length || 0,
          attachmentsKeys: attachments?.map(att => Object.keys(att)),
          attachmentsSample: attachments?.slice(0, 1).map(att => ({
            filename: att.filename,
            contentLength: att.content?.length || 0,
            type: att.type,
            content_type: att.content_type,
            disposition: att.disposition,
            content_id: att.content_id,
            cid: att.cid
          }))
        }
      }), {
        status: resendResponse.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    return new Response(responseBody, {
      status: resendResponse.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })

  } catch (error) {
    console.error('代理请求失败:', error)
    return new Response(JSON.stringify({
      error: 'Failed to send request to Resend.',
      details: error.message
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}