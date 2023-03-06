const NFL_Function = require('./NFL_Function.js');

module.exports = async function (context, req) {
    const nflFunction = new NFL_Function();
    await nflFunction.nfl_function();
    context.res = {
        status: 200,
        body: 'NFL Function executed successfully!',
    };
};
