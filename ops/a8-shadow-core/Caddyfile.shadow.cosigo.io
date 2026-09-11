shadow.cosigo.io {
	handle /api/shadow/status {
		reverse_proxy 127.0.0.1:18024
	}

	handle /api/shadow/comparison {
		reverse_proxy 127.0.0.1:18024
	}

	handle {
		root * /srv/sites/shadow.cosigo.io/public
		file_server
	}
}
