import getDb from './db.js'
const db = getDb()

async function handler(params) {
  try {
    return db.query(params.type)
  } catch (error) {
    console.error(error)
  }
}

export default handler
