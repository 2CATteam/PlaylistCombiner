const express = require('express')
const app = express()
var expressWs = require('express-ws')(app);
app.set('view engine', 'pug')
app.use(express.json())
import SpotifyDBTools from "./db_tools"

db = new SpotifyDBTools();

app.get('/', function (req, res) {
	res.send('Hello World')
});

app.post("/addSession", function(req, res) {
	sessionSettings = {
		name: req.body?.name,
		size: req.body?.size
	};
	if (!sessionSettings.name) {
		res.status(400).json({error: "Invalid name!"});
	} else if (!sessionSettings.size) {
		res.status(400).json({error: "Invalid size!"});
	} else if (sessionSettings.size < 1 || sessionSettings.size > 50) {
		res.status(400).json({error: "Size must be between 1 and 50!"});
	} else {
		db.addSession(sessionSettings.name, sessionSettings.size).then((id) => {
			res.status(200).json({sessionId: id})
		}).catch((err) => {
			res.status(400).json({error: err})
		});
	}
});

app.post("/:session/addUser", function(req, res) {
	if (!req.params.session) {
		res.status(400).json({error: "Invalid session!"});
	} else if (!req.body?.name) {
		res.status(400).json({error: "Invalid name!"});
	} else {
		db.addUser(req.params.session, req.body?.name).then((id) => {
			res.status(200).json({sessionId: id})
		}).catch((err) => {
			res.status(400).json({error: err})
		});
	}
});

app.post("/:session/:user/addSongs", function(req, res) {
	if (!req.params.session) {
		res.status(400).json({error: "Invalid session!"});
	} else if (!req.params.user) {
		res.status(400).json({error: "Invalid user!"});
	} else if (!req.body.songs) {
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

app.get(":session/submit", function(req, res) {
	
})

app.get("/:session/users", function(req, res) {
	res.status(200).json({users: db.getUsers(req.params.session)})
});

app.get("/:session/songs", function(req, res) {
	res.status(200).json({songs: db.getSongs(req.params.session)})
});

app.ws('/echo', function(ws, req) {
	ws.on('message', function(msg) {
		ws.send(msg);
	});
});

app.listen(3000)