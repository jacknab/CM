// Using request
const request = require('request');
request.post('https://textbelt.com/text', {
  form: {
    phone: '7202436886',
    message: 'Hello world http://certxa.com',
    key: '72e1474409622d01ce0546f66c616d92007c3cfeElh50XxpXJm6P1U0B4jsCfgXL',
  },
}, (err, httpResponse, body) => {
  console.log(JSON.parse(body));
});

// Using axios
const axios = require('axios');
axios.post('https://textbelt.com/text', {
  phone: '7202436886',
  message: 'Hello world https://certxa.com',
  key: '72e1474409622d01ce0546f66c616d92007c3cfeElh50XxpXJm6P1U0B4jsCfgXL',
}).then(response => {
  console.log(response.data);
})
