const MLB_Function = require('./MLB_Function.js');

module.exports = async function (context, req) {
    const mlbFunction = new MLB_Function();
    await mlbFunction.mlb_function();
    context.res = {
        status: 200,
        body: 'MLB Function executed successfully!',
    };
};
