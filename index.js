const shuffleSeed = require('shuffle-seed');
const express = require('express')
const app = express()
const axios = require('axios')
const favicon = require('serve-favicon')
const path = require('path')
app.set('view engine', 'pug')
const cookieParser = require('cookie-parser')
app.use(cookieParser())
app.use(express.json())
app.use(favicon(path.join(__dirname, 'static', 'favicon.ico')))
const SpotifyDBTools = require("./db_tools")
const SECRETS = require("./secrets.json")
const LOGIN_REDIRECT = "https://spotify-game.schmessage.com/oauth_callback"

db = new SpotifyDBTools();

app.use(express.static("static"))

app.get('/', function (req, res) {
	res.render('root', {
		session_modes: SpotifyDBTools.SESSION_MODES,
		session_names: SpotifyDBTools.SESSION_MODE_NAMES
	})
})

app.get('/:session([0-9A-F]{8})/', async function (req, res) {
	if (req.query.error) {
		res.sendStatus(400)
	}
	res.render("session_entry", {
		session: await db.getSession(req.params.session),
		session_modes: SpotifyDBTools.SESSION_MODES,
		session_names: SpotifyDBTools.SESSION_MODE_NAMES
	})
})

app.get('/:session([0-9A-F]{8})/quiz', async function (req, res) {
	let songs = await db.getSongs(req.params.session)
	//Shuffle the array of songs
	songs = shuffleSeed.shuffle(songs, songs.length)
	res.render("quiz", {
		session: await db.getSession(req.params.session),
		users: await db.getUsers(req.params.session),
		songs: songs,
		this_user: req.cookies.user,
		include_me: req.query.includeMe
	})
})

app.get("/:session([0-9A-F]{8})/submit", async function(req, res) {
	if (!(req.query?.songs?.length) || !(req.query?.songs?.answers))  {
		res.redirect(`/${req.params.session}/results`)	
	}
	res.cookie("songs", req.query.songs, {httpOnly: true})
	res.cookie("answers", req.query.answers, {httpOnly: true})
	res.redirect(`/${req.params.session}/results`)
})

app.get("/:session([0-9A-F]{8})/results", async function(req, res) {
	let quiz_songs = req.cookies?.songs?.split(",")
	let quiz_answers = req.cookies?.answers?.split(",")
	if (!quiz_songs || !quiz_answers) {
		res.status(400).end()
		return
	}

	let filled_answers = await db.checkAnswers(req.params.session, quiz_songs, quiz_answers)
	res.render("results", {
		session: await db.getSession(req.params.session),
		songs: await db.getSongs(req.params.session),
		filled_answers: filled_answers
	})
})

app.post("/addSession", function(req, res) {
	sessionSettings = {
		name: req.body?.name,
		size: req.body?.size,
		mode: req.body?.mode,
		dedupe: req.body?.mode,
		top_songs_range: req.body?.top_songs_range
	};
	if (!sessionSettings.name) {
		res.status(400).json({error: "Invalid name!"});
	} else if (!sessionSettings.size) {
		res.status(400).json({error: "Invalid size!"});
	} else if (sessionSettings.size < 1 || sessionSettings.size > 50) {
		res.status(400).json({error: "Size must be between 1 and 50!"});
	} else if (sessionSettings.mode == null
		|| isNaN(sessionSettings.mode)
		|| !Number.isInteger(sessionSettings.mode)
		|| sessionSettings.mode < SpotifyDBTools.SESSION_MODES.CUSTOM_PLAYLIST
		|| sessionSettings.mode > SpotifyDBTools.SESSION_MODES.LAST_PLAYED
	) {
		res.status(400).json({error: "Invalid mode!"});
	} else if (sessionSettings.dedupe == null) {
		res.status(400).json({error: "Invalid dedupe setting!"});
	} else if (sessionSettings.mode == SpotifyDBTools.SESSION_MODES.TOP_SONGS
		&& sessionSettings.top_songs_range.length == 0
	) {
		res.status(400).json({error: "Invalid range setting!"});
	} else {
		db.addSession(
			sessionSettings.name,
			sessionSettings.size,
			sessionSettings.mode,
			sessionSettings.dedupe,
			sessionSettings.top_songs_range
		).then((id) => {
			res.status(200).json({sessionId: id})
		}).catch((err) => {
			res.status(400).json({error: err})
		});
	}
});

app.post("/:session([0-9A-F]{8})/addUser", function(req, res) {
	if (!req.params.session) {
		res.status(400).json({error: "Invalid session!"});
	} else if (!req.body?.name) {
		res.status(400).json({error: "Invalid name!"});
	} else {
		db.addUser(req.params.session, req.body?.name, req.cookies?.user).then((id) => {
			res.cookie("user", id || req.cookies?.user, {path: `/${req.params.session}`})
			res.status(200).json({userId: id || req.cookies?.user})
		}).catch((err) => {
			res.status(400).json({error: err})
		});
	}
});

app.post("/:session([0-9A-F]{8})/:user/addSongs", function(req, res) {
	if (!req.params.session) {
		res.status(400).json({error: "Invalid session!"});
	} else if (!req.params.user) {
		res.status(400).json({error: "Invalid user!"});
	} else if (!req.body?.songs) {
		res.status(400).json({error: "Invalid song list!"});
	} else {
		db.addSongs(req.params.session, req.params.user, req.body.songs).then((count) => {
			res.status(200).json({songsAdded: count})
			db.loadSongsHTML(req.params.session)
		}).catch((err) => {
			res.status(400).json({error: err})
		});
	}
});

app.get("/:session([0-9A-F]{8})/users", async function(req, res) {
	res.status(200).json({users: await db.getUsers(req.params.session)})
});

app.get("/:session([0-9A-F]{8})/songs", function(req, res) {
	res.status(200).json({songs: db.getSongs(req.params.session)})
});

//https://stackoverflow.com/questions/20728783/shortest-code-to-get-random-string-of-numbers-and-letters
function generateRandomString(length) {
    var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz1234567890";
    var randomstring = '';
    for (var i = 0; i < length; i++) {
        var rnum = Math.floor(Math.random() * chars.length);
        randomstring += chars[rnum];
    }
    return randomstring;
}

//Spotify auth section
app.get("/:session([0-9A-F]{8})/login", function(req, res) {
	//https://developer.spotify.com/documentation/web-api/tutorials/code-flow


	let state = generateRandomString(16);
	let scope = 'playlist-read-private playlist-modify-private user-top-read user-read-recently-played user-library-read';

	res.cookie("session", req.params.session, { "httpOnly": true })
	res.redirect('https://accounts.spotify.com/authorize?' +
		new URLSearchParams({
			response_type: 'code',
			client_id: SECRETS.client_id,
			scope: scope,
			redirect_uri: LOGIN_REDIRECT,
			state: state
		}).toString()
	);
})

function getAuth(req, res, options, callback) {
	let err_handler = function(err) {
		console.error(err.response.data || err.request || err.message)
		res.redirect(req.path + "?" +
			new URLSearchParams({
				error: 'code_rejected'
			}).toString()
		);
	}
	axios(options).then(function (response) {
		if (response.status != 200) {
			err_handler({ response: response })
		}
		res.cookie("spotify_token", response.data.access_token, {
			maxAge: (response.data.expires_in || 10) * 1000
		})
		res.cookie("refresh_cookie", response.data.refresh_token)
		callback(req, res)
		
	}).catch(err_handler)
}

//https://developer.spotify.com/documentation/web-api/tutorials/code-flow
app.get('/oauth_callback', function(req, res) {

	let code = req.query.code || null;
	let state = req.query.state || null;

	if (req.query.error) {
		res.sendStatus(400)
		return
	}

	if (state === null) {
		res.redirect(`/${sessionId}?` +
			new URLSearchParams({
				error: 'state_mismatch'
			}).toString()
		);
	} else {
		let authOptions = {
			url: 'https://accounts.spotify.com/api/token',
			method: "post",
			data: {
				code: code,
				redirect_uri: LOGIN_REDIRECT,
				grant_type: 'authorization_code'
			},
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				'Authorization': 'Basic ' + (new Buffer.from(SECRETS.client_id + ':' + SECRETS.client_secret).toString('base64'))
			}
		};
		getAuth(req, res, authOptions, (req, res) => {
			let sessionId = req.cookies?.session || ""
			res.redirect('/' + sessionId)
		})
	}
});

app.get('/:session([0-9A-F]{8})/refresh_token', function(req, res) {
	let refresh_token = req.cookies?.refresh_cookie
	if (!refresh_token || req.query.error) {
		res.sendStatus(400)
	} else {
		res.cookie("session", req.params.session, { "httpOnly": true })
		let authOptions = {
			url: 'https://accounts.spotify.com/api/token',
			method: "post",
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				'Authorization': 'Basic ' + (new Buffer.from(SECRETS.client_id + ':' + SECRETS.client_secret).toString('base64'))
			},
			data: {
				grant_type: 'refresh_token',
				refresh_token: refresh_token
			},
			json: true
		};
		getAuth(req, res, authOptions, (req, res) => {
			res.sendStatus(200).end()
		});
	}
})

app.listen(4000)
console.log("Starting up, listening on port 4000!")