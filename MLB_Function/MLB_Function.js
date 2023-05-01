const NFT_Storage_Request = require('./Storage_Requests.js');
const SPORTSDATA_Requests = require('./SPORTSDATA_Requests.js');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const axios = require('axios');

class MLB_Function {
  constructor() {}

  async mlb_function() {
    const sportsDataRequest = new SPORTSDATA_Requests();
    const nftStorageRequest = new NFT_Storage_Request();

    const credential = new DefaultAzureCredential();
    const url = `https://AxApiKeys.vault.azure.net/`;

    // same for any sport so use NFL
    const storageName = "STORAGE-NFL-PROD";
    const githubName = "GITHUB-PAK"
    const sd_secretName = "SD-MLB-KEY";
    const secretClient = new SecretClient(url, credential);
    const nft_mlb_token = await secretClient.getSecret(storageName).then(result => result.value);
    // get github access key
    const github_access_token = await secretClient.getSecret(githubName).then(result => result.value);
    // Get sportsdata key for mlb
    const sd_key = await secretClient.getSecret(sd_secretName).then(result => result.value);

    // get athletes from sportsdata
    const sdAthleteList = await sportsDataRequest.getSportsdataAthletes("MLB", 2023, sd_key);
    // get the current time
    const current_time = new Date();

    // seperate list of athletes and athlete file directory
    var storage_athlete_list;

    var athlete_directory;

    const github_response = await axios.get('https://raw.githubusercontent.com/AthleteX-DAO/sports-cids/main/mlb.json');
    const { list, directory } = github_response.data;
    
    storage_athlete_list = await nftStorageRequest.fetchStorage(list, nft_mlb_token);
    // if only the athlete list exists
    if (directory === "null") {
        athlete_directory = null;
    }
    // else, both should exist
    else {
        athlete_directory = await nftStorageRequest.fetchStorage(directory, nft_mlb_token);
    }
    
    storage_athlete_list = await nftStorageRequest.fetchDesiredAthleteList(storage_athlete_list, nft_mlb_token);
    storage_athlete_list = storage_athlete_list.athletes;

    // list of AthleteIDs in the directory
    var file_list = [];
    if (athlete_directory != null) {
        file_list = nftStorageRequest.fetchAllAthletesIDs(athlete_directory);
    }
    
    // array that will store all the athlete jsons AND their seperate price history file
    // this is what will be sent back to storage
    // all_athletes will be attached to athlete_jsons in the end
    var athlete_jsons = new Array();
    var all_athletes_json = new Array();

    // need league WeightOnBase (mean not including those with no PlateAppearances)
    // need sum of League PlateAppearances
    let lgWeightOnBase = 0.0;
    let sumLeaguePlateAppearances = 0;
    let numAthletes = 0;
    for (let i = 0; i < sdAthleteList.length; i++) {
        if (sdAthleteList[i].PlateAppearances > 0) {
            numAthletes++;
            sumLeaguePlateAppearances += sdAthleteList[i].PlateAppearances;
            lgWeightOnBase += sdAthleteList[i].WeightedOnBasePercentage;
        }
    }

    lgWeightOnBase /= numAthletes;

    
    // add time and price to each athlete
    // then add needed vars to new json list
    // go through each athlete in sportsdata, saving only the desired ones
    for (let i = 0; i < sdAthleteList.length; i++) {
        // skip athletes we don't use (greatly imporves preformance)
        if (!storage_athlete_list.includes(sdAthleteList[i].PlayerID)) {
            continue;
        }
        let current_athlete = sdAthleteList[i];
        // add price and time to athlete
        this.computePrice(current_athlete, current_time, lgWeightOnBase, sumLeaguePlateAppearances);

        // add needed vars to new athlete
        var cur_athlete_json = {
            ID: current_athlete.PlayerID,
            Name: current_athlete.Name,
            Team: current_athlete.Team,
            Position: current_athlete.Position,
            PlateAppearances: current_athlete.PlateAppearances,
            WeightedOnBasePercentage: current_athlete.WeightedOnBasePercentage,
            StolenBases: current_athlete.StolenBases,
            Errors: current_athlete.Errors,
            Games: current_athlete.Games,
            HomeRuns: current_athlete.HomeRuns,
            Strikeouts: current_athlete.Strikeouts,
            Saves: current_athlete.Saves,
            AtBats: current_athlete.AtBats,
            BookPrice: current_athlete.Price,
            Time: current_time,
        };

        // add the current athlete to the json list
        athlete_jsons.push(cur_athlete_json);
        // add the current athlete to the all athlete list
        all_athletes_json.push(cur_athlete_json);
        // add their priceHistory to the json list
        const prices = await this.updatePriceList(file_list, current_athlete, athlete_directory, current_time, nft_mlb_token);
        athlete_jsons.push(
            {
                ID: current_athlete.PlayerID+"_history",
                Name: current_athlete.Name,
                Hour: prices[0],
                Day: prices[1],
            } 
        );
    }

    // add the all athletes file to the final json
    athlete_jsons.push(
        {
            ID: "ALL_PLAYERS",
            Athletes: all_athletes_json
        }
    );

    // send the athlete json to nft.storage
    nftStorageRequest.uploadAndDelete(athlete_jsons, athlete_directory, nft_mlb_token, github_access_token, "mlb");
  }

  async updatePriceList(files, athlete, directory, time, token) {
    const nftStorageRequest = new NFT_Storage_Request();

    let file = athlete.PlayerID + "_history";
    let current_price = athlete.Price;

    // if there is no file, return [[hour],[day]]
    if (!files.includes(file)) {
        return [
            [ {BookPrice: current_price, Time: time} ],
            [ {BookPrice: current_price, Time: time} ],
        ];
    }

    // else retrieve the history and add new prices
    // grab athlete history from nft.storage
    const storedHistory = await nftStorageRequest.fetchFile(directory, file, token)

    return [
        this.updateInterval(storedHistory.Hour, "Hour", current_price, time),
        this.updateInterval(storedHistory.Day, "Day", current_price, time),
    ];
  }

  updateInterval(prices, interval, current_price, time) {
    // prices ranging from old to newest, storing the last NUM_PRICE_ENTRIES prices
    const NUM_PRICE_ENTRIES = 12;
    var time_update = false;

    switch (interval) {
        case "Hour":
            // if there are no elements, return true
            if (prices.length == 0) {
                time_update = true;
            }
            // get the last hour and compare to now
            let last_hour = new Date(prices[prices.length-1].Time).getHours();
            let cur_hour = new Date(time).getHours();
            time_update = last_hour != cur_hour;
            break;
        case "Day":
            // if there are no elements, return true
            if (prices.length == 0) {
                time_update = true;
            }
            // get the last hour and compare to now
            let last_day = new Date(prices[prices.length-1].Time).getDate();
            let cur_day = new Date(time).getDate();
            time_update = last_day != cur_day;
            break;
    }
    
    // if at past or max capacity, delete first few until 1 below capacity
    while (prices.length >= NUM_PRICE_ENTRIES) {
        // removes first
        prices.shift();
    }

    // if time for an update
    if (time_update) {
        prices.push( {BookPrice: current_price, Time: time} );
    }

    // return prices
    return prices;
  }

  computePrice(athlete, time, lgWeightOnBase, sumLeaguePlateAppearances) {
    try {
        const avg50yrRPW = 9.757;
        const mlbPositionalAdjustments = {
            "C": 12.5,
            "1B": -12.5,
            "2B": 2.5,
            "3B": 2.5,
            "SS": 7.5,
            "LF": -7.5,
            "CF": 2.5,
            "RF": -7.5,
            "DH": -17.5
        };

        const battingRuns = (athlete.PlateAppearances * (athlete.WeightedOnBasePercentage - lgWeightOnBase)) / 1.25;
        const baseRunningRuns = athlete.StolenBases * 0.2;
        const fieldingRuns = athlete.Games === 0 ? 0 : (athlete.Errors * -10) / (athlete.Games * 9);
        const positionalAdjustments = (athlete.Games * 9 * mlbPositionalAdjustments[athlete.Position] ) / 1458.0;
        const replacementRuns = sumLeaguePlateAppearances === 0 ? 0 : (athlete.PlateAppearances * 5561.49) / sumLeaguePlateAppearances;
        const statsNumerator = battingRuns + baseRunningRuns + fieldingRuns + positionalAdjustments + replacementRuns;

        // restrict the price to between 0 and 15000
        const price = Math.min(15000, Math.max(0, (statsNumerator / avg50yrRPW)));
        
        athlete.Time = time;
        athlete.Price = price;
    } catch (error) {
        console.error(error);
    }
  }
}

module.exports = MLB_Function;
