require('dotenv').config()
import http from 'http'
import express, { Request, Response } from 'express'
import SpotifyWebApi from 'spotify-web-api-node'
import chalk from 'chalk'
import loggerMiddleware from './loggerMiddleware'
import { Server, Socket } from 'socket.io'
import * as cors from 'cors'

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI,
  // accessToken: process.env.SPOTIFY_ACCESS_TOKEN,
  refreshToken: process.env.SPOTIFY_REFRESH_TOKEN,
})

let tokenExpirationEpoch: number

// ✅ made it not need access token and instead can rely on the perm refresh token
spotifyApi.refreshAccessToken().then(
  function (data) {
    tokenExpirationEpoch = new Date().getTime() / 1000 + data.body['expires_in']
    spotifyApi.setAccessToken(data.body['access_token'])
  },
  function (err) {
    console.log(chalk.red('uh oh token no refresh'), err.message)
  },
)

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  path: '/io',
  cors: {
    origin: '*',
  },
})
const conlist: Socket[] = []
app.use(cors.default())

app.use(loggerMiddleware)

// @ts-ignore
app.get('/', (req: Request, res: Response) => {
  spotifyApi.getMyCurrentPlaybackState().then((data) => {
    // please ignore this it's horrible i know
    if (!data.body.item) {
      return res.render('index', {
        failure: true,
      })
    }
  })
  return res.send('hello world')
})

// @ts-ignore
app.get('/raw', (req: Request, res: Response) => {
  spotifyApi.getMyCurrentPlaybackState().then((data) => {
    res.send(data)
  })
})

// @ts-ignore
app.get('/auth', (req: Request, res: Response) => {
  res.redirect(
    // @ts-expect-error
    spotifyApi.createAuthorizeURL([
      'user-read-private',
      'user-read-playback-state',
      'user-read-currently-playing',
    ]),
  )
})

// @ts-ignore
app.get('/callback', (req: Request, res: Response) => {
  // @ts-ignore
  res.send(req.query.code)
})

io.on('connection', (socket) => {
  conlist.push(socket)
  console.log(chalk.green(`${conlist.length} connections`))
  socket.on('disconnect', () => {
    conlist.splice(conlist.indexOf(socket), 1)
    console.log(chalk.green(`${conlist.length} connections`))
  })
})

setInterval(function () {
  console.log(
    chalk.cyan(
      'Time left: ' +
        Math.floor(tokenExpirationEpoch - new Date().getTime() / 1000) +
        ' seconds left!',
    ),
  )

  if (Math.floor(tokenExpirationEpoch - new Date().getTime() / 1000) < 3300) {
    spotifyApi.refreshAccessToken().then(
      function (data) {
        tokenExpirationEpoch =
          new Date().getTime() / 1000 + data.body['expires_in']
        spotifyApi.setAccessToken(data.body['access_token'])
        console.log(
          chalk.green(
            'hehe token refreshed, ' +
              Math.floor(tokenExpirationEpoch - new Date().getTime() / 1000) +
              ' seconds remain',
          ),
        )
      },
      function (err) {
        console.log(chalk.red('uh oh token no refresh'), err.message)
      },
    )
  }
}, 1000)

setInterval(function () {
  conlist.forEach((socket) => {
    spotifyApi.getMyCurrentPlaybackState().then((data) => {
      if (!data.body.item) {
        return
      }
      let info = {
        // lol
        device: data.body.device.name,
        trackName: data.body.item.name,
        trackUrl: data.body.item.external_urls.spotify,
        // @ts-ignore
        albumName: data.body.item.album.name,
        // @ts-ignore
        albumUrl: data.body.item.album.external_urls.spotify,
        // @ts-ignore
        albumImageUrl: data.body.item.album.images[0].url,
        // @ts-ignore
        artistName: data.body.item.artists[0].name,
        // @ts-ignore
        artistUrl: data.body.item.artists[0].external_urls.spotify,
        trackProgress: data.body.progress_ms,
        trackDuration: data.body.item.duration_ms,
        playing: data.body.is_playing,
      }
      socket.emit('update', JSON.stringify(info))
    })
  })
}, 1000)

server.listen(3000, () => {
  console.log('Listening on port 3000')
})
