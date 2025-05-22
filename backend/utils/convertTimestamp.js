function convertTimestamp_SqlToUnix(timestamp) {
	if (timestamp === null) return null;
	try {
		return Math.floor(new Date(timestamp).getTime() / 1000);
	} catch (err) {
		return null;
	}
}

module.exports = {
	convertTimestamp_SqlToUnix
}