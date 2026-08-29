import { createApp } from './app.js'
import { getConfig } from './config.js'

const config = getConfig()
const app = createApp(config)
const port = config.PORT ?? config.API_PORT

app.listen(port, '0.0.0.0', () => {
  console.log(`Farmear Aura API listening on port ${port}`)
})
