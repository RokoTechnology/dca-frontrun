export async function checkAuth(req, isPublic) {
  return true
}

// we have to destructure the first arg (context)
// or leaf values (request.req.headers.whatever)
// may be undefined later
export async function endpointHandler({
  set, parsed
}, fn, getCtx, isPublic) {
  if (!fn) {
    set.status = 400
    return { ok: false, error:  'No Handler Function' }
  }

  const isAuth = await checkAuth(parsed, isPublic)
  if (!isAuth) {
    set.status = 403
    return { ok: false, error: 'Not Authorized' }
  }

  const ctx = getCtx ? await getCtx(parsed.headers?.test) : {}
  const handlerParams = {
    ...(parsed.body || {}),
    ...(parsed.query || {}),
    ...(parsed.params|| {}),
  }
  return fn(handlerParams)
}

export default endpointHandler
