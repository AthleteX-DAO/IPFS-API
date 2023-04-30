const https = require('https');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

class SPORTSDATA_Requests {
    constructor() {}
  
    async getSportsdataAthletes(sport, season, key) {
        const URL_prefix = `https://api.sportsdata.io/v3/`;
        const URL_suffix = `/stats/json/PlayerSeasonStats/${season}?key=`

        let url = URL_prefix + sport + URL_suffix + key;
        
        const athlete_list = new Promise(async (resolve, reject) => {
            https.get(url,
                (response) => {
                    let data = '';
                    response.on('data', (chunk) => {
                        data += chunk;
                    });
                    response.on('end', () => {
                        resolve(JSON.parse(data));
                    });
                    response.on('error', (error) => {
                        reject(error);
                });
            });
        });

        return await athlete_list;
    }
}
  
module.exports = SPORTSDATA_Requests;
  