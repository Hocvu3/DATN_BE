const http = require('http');

const options = {
  host: '0.0.0.0',
  port: process.env.PORT || 3000,
  path: '/api/health',
  timeout: 2000,
};

const request = http.request(options, res => {
  console.log(`Health check response: ${res.statusCode}`);
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

request.on('error', function (err) {
  console.log(`Health check error: ${err.message}`);
  process.exit(1);
});

request.on('timeout', function () {
  console.log('Health check timeout');
  request.destroy();
  process.exit(1);
});

request.end();
