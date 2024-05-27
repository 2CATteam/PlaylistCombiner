function getRequest(url, header) {
	return new Promise((res, rej) => {
		let submitReq = new XMLHttpRequest()
		let loaded = function() {
			if (this.status > 399) {
				rej(this)
			} else {
				res(this)
			}
		}
		submitReq.addEventListener("load", loaded);
		submitReq.open("GET", url)
		for (let i in header) {
			submitReq.setRequestHeader(i, header[i])
		}
		submitReq.send()
	})
}

function postRequest(url, body, header={}) {
	return new Promise((res, rej) => {
		let submitReq = new XMLHttpRequest();
		let loaded = function() {
			if (this.status > 399) {
				rej(this)
			} else {
				res(this)
			}
		}
		submitReq.addEventListener("load", loaded);
		submitReq.open("POST", url);
		for (let i in header) {
			submitReq.setRequestHeader(i, header[i])
		}
		submitReq.send(JSON.stringify(body));
	})
}

function getCookie(key) {
	obj = {}
	list = document.cookie.split(";")
	for (x in list) {
		if (list[x]) {
			pair = list[x].split("=", 2)
			obj[pair[0].trim()] = pair[1].trim()
		}
	}
	return obj[key]
}
