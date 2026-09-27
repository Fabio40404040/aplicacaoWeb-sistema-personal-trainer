import api from '../../backend/src/index.js'

export function onRequest(context) {
  return api.fetch(context.request, context.env)
}
