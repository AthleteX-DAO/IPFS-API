const https = require('https');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

class SPORTSDATA_Requests {
    constructor() {}
  
    async getSportsdataAthletes(sport) {
        const URL_prefix = `https://api.sportsdata.io/v3/`;
        const URL_suffix = `/stats/json/PlayerSeasonStats/2022?key=`

        // TODO: Get the right key based off the sport
        const credential = new DefaultAzureCredential();
        const secretName = "SD-NFL-KEY";
        const secretUrl = `https://AxApiKeys.vault.azure.net/`;
        const secretClient = new SecretClient(secretUrl, credential);
        const key = await secretClient.getSecret(secretName).then(result => result.value);

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
  