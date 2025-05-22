module.exports = {
	development: {
	  // Necessary for being able to connect to MySQL container with correct AUTH type
	  client: 'mysql2',
	  connection: {
		// Name of service in docker-compose
		host: 'dbserver',
		// Environment variables are defined in the api service in docker-compose
		user: process.env.MYSQL_USER,
		password: process.env.MYSQL_PASSWORD,
		database: process.env.MYSQL_DATABASE
	  }
	}
  };
