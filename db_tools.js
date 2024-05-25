'use-strict'
const sqlite3 = require('sqlite3');
const axios = require('axios')

//Class used for connecting to the DB
class SpotifyDBTools {
    constructor() {
        //When we start up, initialize the DB connection
        this.connection_ready = false;
        this.connection = new sqlite3.Database('spotify.db', this.dbReady.bind(this));
    }

    //Once the DB connection is ready, ensure that the tables exist
    dbReady(err) {
        //First, log any errors
        if (err) {
            console.error(err);
        } else {
            //SQL commands for making the tables
            this.connection.exec(`
                CREATE TABLE IF NOT EXISTS sessions(
                    id TEXT PRIMARY KEY,
                    name TEXT,
                    size INTEGER
                );

                CREATE TABLE IF NOT EXISTS users(
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session TEXT,
                    name TEXT
                );

                CREATE TABLE IF NOT EXISTS songs(
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session TEXT,
                    user INTEGER,
                    song TEXT,
                    html TEXT
                );
            `, (err) => {
                //Log any errors
                if (err) {
                    console.error(err);
                } else {
                    //Mark that we're good and initialized
                    this.connection_ready = true;
                }
            })
        }
    }

    //Create a session with the given name and size
    addSession(name, size) {
        //Wrap in a promise because promises are great
        return new Promise((res, rej) => {
            //Reject if the connection isn't ready
            if (!this.connection_ready) {
                rej(new Error("DB Connection was not ready!"));
                return;
            }
            //Basic insert
            this.connection.run("INSERT INTO sessions(id, name, size) VALUES (upper(hex(randomblob(16))), ?, ?)", name, size, function(err) {
                //Throw any error which might exist
                if (err) {
                    rej(err);
                } else {
                    //Otherwise, resolve with the ID of the new session
                    res(this.lastID);
                }
            })
        })
    }

    //Create a user in the given session with the given name
    addUser(session, name) {
        //Wrap in a promise because promises are great
        return new Promise((res, rej) => {
            //Reject if the connection isn't ready
            if (!this.connection_ready) {
                rej(new Error("DB Connection was not ready!"));
                return;
            }
            //Basic insert
            this.connection.run("INSERT INTO users(session, name) VALUES (?, ?)", session, name, function(err) {
                //Throw any error which might exist
                if (err) {
                    rej(err);
                } else {
                    //Otherwise, resolve with the ID of the new session
                    res(this.lastID);
                }
            })
        })
    }

    //Add a song in the given session by the given user, with the given song identifier
    addSong(session, user, song) {
        //Promise wrapper
        return new Promise((res, rej) => {
            //Reject if connection not ready
            if (!this.connection_ready) {
                rej(new Error("DB Connection was not ready!"));
                return;
            }
            //Basic insert
            this.connection.run("INSERT INTO songs(session, user, song) VALUES (?, ?, ?)", session, user, song, function(err) {
                //Throw any error
                if (err) {
                    rej(err);
                } else {
                    //Resolve with the ID of the new song
                    res(this.lastID);
                }
            })
        })
    }

    //Add a list of songs
    async addSongs(session, user, songs) {
        //Check for validity
        if (!Array.isArray(songs)) {
            throw new Error("Invalid songs array!")
        }
        //Check it's not too many songs
        if (songs.length() > await this.getSession(session).size) {
            throw new Error("Too many songs!")
        }
        //Clear all existing songs for user (they're being replaced)
        await this.clearSongs(session, user);

        //Now, finally, add the songs
        for (let song of songs) {
            await this.addSong(session, user, song);
        }
        
        //Return the number of songs added
        return songs.length()
    }

    loadSongsHTML(session) {
        this.connection.each("SELECT FROM songs WHERE html IS NULL AND session = ?", session, function(err, row) {
            //Throw any error
            if (err) {
                console.error(err)
            } else {
                //Resolve with the ID of the new song
                loadSongHTML(session, row.song)
            }
        })
    }

    loadSongHTML(session, song) {
        song = encodeURIComponent(song)
        axios.get("https://open.spotify.com/oembed/?url=" + song).then((response) => {
            this.connection.run("UPDATE songs SET html = ? WHERE session = ? AND song = ?", response.html, session, song);
        }).catch((err) => {
            console.error(err);
        })
    }

    //Clear all songs for a given user
    clearSongs(session, user) {
        //Promise wrapper
        return new Promise((res, rej) => {
            //Reject if connection not ready
            if (!this.connection_ready) {
                rej(new Error("DB Connection was not ready!"));
                return;
            }
            //Basic deletion
            this.connection.run("DELETE FROM songs WHERE session = ? AND user = ?", session, user, function(err) {
                //Throw any error
                if (err) {
                    rej(err);
                } else {
                    //Resolve with the ID of the new song
                    res(this.changes);
                }
            })
        })
    }

    //Get the session details for a given session
    getSession(session) {
        //Promise wrapper
        return new Promise((res, rej) => {
            //Reject if connection not ready
            if (!this.connection_ready) {
                rej(new Error("DB Connection was not ready!"));
                return;
            }
            //Select the name and song count
            this.connection.get(`
                        SELECT name, size
                        FROM sessions
                        WHERE sessions.id = ?
                    `,
                    session, function(err, row) {
                //Throw any error
                if (err) {
                    rej(err);
                } else {
                    //Resolve with the ID of the new song
                    res(row);
                }
            })
        })
    }

    //Get the users in a given session, and the number of songs they put into the DB
    getUsers(session) {
        //Promise wrapper
        return new Promise((res, rej) => {
            //Reject if connection not ready
            if (!this.connection_ready) {
                rej(new Error("DB Connection was not ready!"));
                return;
            }
            //Select the ID, name, and song count
            this.connection.all(`
                        SELECT users.id, users.name, COUNT(*)
                        FROM users, songs
                        WHERE
                            songs.user = user.id
                            AND users.session = ?
                        GROUP BY users.id;
                    `,
                    session, function(err, rows) {
                //Throw any error
                if (err) {
                    rej(err);
                } else {
                    //Resolve with the ID of the new song
                    res(rows);
                }
            })
        })
    }

    //Get the song list in a given session, with the users who submitted them
    getSongs(session) {
        //Promise wrapper
        return new Promise((res, rej) => {
            //Reject if connection not ready
            if (!this.connection_ready) {
                rej(new Error("DB Connection was not ready!"));
                return;
            }
            //Select the ID, name, and song count
            this.connection.all(`
                        SELECT songs.id, songs.song, songs.html, user.id, user.name
                        FROM users, songs
                        WHERE
                            songs.user = user.id
                            AND songs.session = ?
                        ORDER BY songs.song ASC
                    `,
                    session, function(err, rows) {
                //Throw any error
                if (err) {
                    rej(err);
                } else {
                    //Resolve with the array of songs
                    res(rows);
                }
            })
        })
    }
}

module.exports = SpotifyDBTools