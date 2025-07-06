'use-strict'
const sqlite3 = require('sqlite3');
const axios = require('axios');

//Class used for connecting to the DB
class SpotifyDBTools {
    constructor() {
        //When we start up, initialize the DB connection
        this.connection_ready = false;
        this.connection = new sqlite3.Database('spotify.db', this.dbReady.bind(this));
    }

    static SESSION_MODES = {
        CUSTOM_PLAYLIST: 0,
        TOP_SONGS: 1,
        LIKED_SONGS: 2,
        LAST_PLAYED: 3
    }

    static SESSION_MODE_NAMES = {
        CUSTOM_PLAYLIST: "Use a specific Playlist",
        TOP_SONGS: "Use our Top Songs",
        LIKED_SONGS: "Use our Liked Songs",
        LAST_PLAYED: "Use our Last Played songs"
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
                    size INTEGER,
                    mode INTEGER,
                    dedupe INTEGER,
                    top_songs_range TEXT
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
    addSession(name, size, mode, dedupe, top_songs_range) {
        //Wrap in a promise because promises are great
        return new Promise((res, rej) => {
            //Reject if the connection isn't ready
            if (!this.connection_ready) {
                rej(new Error("DB Connection was not ready!"));
                return;
            }
            //Alias the this.connection object for use in an inner function
            let db = this.connection
            //Basic insert
            this.connection.run("INSERT INTO sessions(id, name, size, mode, dedupe, top_songs_range) VALUES (upper(hex(randomblob(4))), ?, ?, ?, ?, ?)",
                name,
                size,
                mode,
                dedupe ? 1 : 0,
                top_songs_range,
                function(err) {
                    //Throw any error which might exist
                    if (err) {
                        rej(err);
                    } else {
                        //Get the ID with the row ID
                        db.get("SELECT id FROM sessions WHERE rowid = ?", this.lastID, function(err, row) {
                            //Throw any error which might exist
                            if (err) {
                                rej(err);
                            } else {
                                //Otherwise, resolve with the ID of the new session
                                res(row.id);
                            }
                        })
                    }
                }
            )
        })
    }

    //Create a user in the given session with the given name
    addUser(session, name, id) {
        //Wrap in a promise because promises are great
        return new Promise((res, rej) => {
            //Reject if the connection isn't ready
            if (!this.connection_ready) {
                rej(new Error("DB Connection was not ready!"));
                return;
            }
            //Basic insert
            if (id == null) {
                this.connection.run("INSERT INTO users(session, name) VALUES (?, ?)", session, name, function(err) {
                    //Throw any error which might exist
                    if (err) {
                        rej(err);
                    } else {
                        //Otherwise, resolve with the ID of the new session
                        res(this.lastID);
                    }
                })
            } else {
                this.connection.run("UPDATE users SET name = ? WHERE id = ? AND session = ?", name, id, session, function(err) {
                    //Throw any error which might exist
                    if (err) {
                        rej(err);
                    } else {
                        //Otherwise, resolve with the ID of the new session
                        res(null);
                    }
                })
            }
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
        if (songs.length > await this.getSession(session).size) {
            throw new Error("Too many songs!")
        }

        //Clear all existing songs for user (they're being replaced)
        try {
            await this.clearSongs(session, user);
        } catch(err) {
            throw err
        }

        //Now, finally, add the songs
        for (let song of songs) {
            try {
                await this.addSong(session, user, song);
            } catch(err) {
                throw err
            }
        }
        
        //Return the number of songs added
        return songs.length
    }

    loadSongsHTML(session) {
        this.connection.each("SELECT * FROM songs WHERE html IS NULL AND session = ?", session, (err, row) => {
            //Throw any error
            if (err) {
                console.error(err)
            } else {
                //Resolve with the ID of the new song
                this.loadSongHTML(session, row.song)
            }
        })
    }

    loadSongHTML(session, song) {
        let song_link = 'https://open.spotify.com/track/' + song
        song_link = encodeURIComponent(song_link)
        axios.get("https://open.spotify.com/oembed?url=" + song_link).then((response) => {
            this.connection.run("UPDATE songs SET html = ? WHERE session = ? AND song = ?", response.data.html, session, song);
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
                        SELECT name, size, id, mode, dedupe, top_songs_range
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
                        SELECT users.id, users.name, COUNT(*) AS song_count
                        FROM users, songs
                        WHERE
                            songs.user = users.id
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
                        SELECT songs.id AS song_id, songs.song, songs.html, users.id AS user_id, users.name
                        FROM users, songs
                        WHERE
                            songs.user = users.id
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

    async checkAnswers(session, songs_order, answers_given=null) {
        //Reject if connection not ready
        if (!this.connection_ready) {
            rej(new Error("DB Connection was not ready!"));
            return;
        }
        // Return object should be an array of the following form:
        /*
            {
                song_id: <id>,
                given_answer: {
                    id: <user_id>,
                    name: <user_name>
                },
                correct_answers: [
                    {
                        id: <user_id>,
                        name: <user_name>
                    }
                ],
                song_data: <song_id_from_Spotify>,
                song_html: <song_html>,
                correct: true/false
                correct_answer_string: <comma-separated list of names>
            }
        */
        let to_return = []
        //First, add the song
        for (let i of songs_order) {
            to_return.push({song_id: i})
        }
        let users = await this.getUsers(session);
        //Fill in users
        if (answers_given != null) {
            for (let i in answers_given) {
                for (let j in users) {
                    if (users[j].id == answers_given[i]) {
                        to_return[i].given_answer = {
                            id: answers_given[i],
                            name: users[j].name
                        }
                    }
                }
            }
        }
        //Fill in correct answers and song data
        for (let i in to_return) {
            to_return[i].correct_answers = await this.getAnswers(session, to_return[i].song_id)
            let song_data = await this.getSong(to_return[i].song_id)
            to_return[i].song_data = song_data.song
            to_return[i].song_html = song_data.html
        }
        //Mark if correct
        for (let i of to_return) {
            i.correct_answer_string = ""
            i.correct = false
            for (let j of i.correct_answers) {
                if (answers_given != null) {
                    if (i.given_answer.id == j.id) {
                        i.correct = true
                    }
                }
                i.correct_answer_string += j.name
                i.correct_answer_string += ", "
            }
            i.correct_answer_string = i.correct_answer_string.substring(0, i.correct_answer_string.length - 2)
        }
        return to_return
    }

    getAnswers(session, song_id) {
        //Promise wrapper
        return new Promise((res, rej) => {
            //Reject if connection not ready
            if (!this.connection_ready) {
                rej(new Error("DB Connection was not ready!"));
                return;
            }
            this.connection.all(`
                SELECT users.id AS id, users.name AS name
                FROM songs song_with_id
                INNER JOIN songs song_with_data ON song_with_id.song = song_with_data.song
                INNER JOIN users ON song_with_data.user = users.id
                WHERE
                    song_with_id.id = ?
                    AND song_with_data.session = ?
                ORDER BY users.name ASC
            `, song_id, session, function(err, rows) {
                //Throw any error
                if (err) {
                    rej(err);
                } else {
                    //Resolve with the array of users
                    res(rows);
                }
            })
        })
    }

    getSong(song_id) {
        //Promise wrapper
        return new Promise((res, rej) => {
            //Reject if connection not ready
            if (!this.connection_ready) {
                rej(new Error("DB Connection was not ready!"));
                return;
            }
            this.connection.get(`
                        SELECT song, html
                        FROM songs
                        WHERE
                            id = ?
                    `,
                    song_id, function(err, row) {
                //Throw any error
                if (err) {
                    rej(err);
                } else {
                    //Resolve with song data
                    res(row);
                }
            })
        })
    }

    // Ingest an array of songs (as in from getSongs) and add the correct answer(s)
    async augmentSongs(session, songs) {
        let songs_order = []
        for (let song of songs) {
            songs_order.push(song.song_id)
        }
        let answers = await this.checkAnswers(session, songs_order, null)
        for (let i in songs) {
            songs[i].correct_answers = answers[i].correct_answers
            songs[i].correct_answer_string = answers[i].correct_answer_string
        }
    }
}

module.exports = SpotifyDBTools