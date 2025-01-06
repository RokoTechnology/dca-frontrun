async function fetchUtil(uri, body, method, headers = {}, cache) {
  try {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json'

    const request = await fetch(uri, {
      method: method || 'POST'),
      body: body ? JSON.stringify(body) : undefined,
      headers
    }, { cache })
    if (!request) {
      throw new Error('no request')
    }
    const response = await request.json()
    if (!response) {
      throw new Error('no response')
    }
    return response
  } catch (e) {
    console.error(e)
    if (e.error) {
      return e
    }
    return { error: e }
  }
}

export default fetchUtil
