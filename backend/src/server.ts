import { createApp } from './app.js'
import { getConfig } from './config.js'

const config = getConfig()
const app = createApp(config)
const port = config.PORT ?? config.API_PORT

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Farmear Aura API listening on port ${port}`)
})

server.requestTimeout = 30_000
server.headersTimeout = 15_000
server.keepAliveTimeout = 5_000
server.maxRequestsPerSocket = 100
