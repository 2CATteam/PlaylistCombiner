'use-strict'
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('spotify.db', dbReady);

//Class used for connecting to the DB
class SpotifyDBTools {
    constructor() {
        //When we start up, initialize the DB connection
        this.connection_ready = false;
        this.connection = new sqlite3.Database('spotify.db', this.dbReady);
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
                    song TEXT
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
    createSession(name, size) {
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
    createUser(session, name) {
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
                        SELECT songs.id, songs.song, user.id, user.name
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