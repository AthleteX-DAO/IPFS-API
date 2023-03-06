const NFT_Storage_Request = require('./NFT_Storage_Requests.js');
const SPORTSDATA_Requests = require('./SPORTSDATA_Requests.js');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

class NFL_Function {
  constructor() {}

  async nfl_function() {
    const sportsDataRequest = new SPORTSDATA_Requests();
    const nftStorageRequest = new NFT_Storage_Request();

    // TODO: Hide this key
    const credential = new DefaultAzureCredential();
    const secretName = "NFT-STORAGE-NFL-API-KEY";
    const url = `https://AxApiKeys.vault.azure.net/`;
    const secretClient = new SecretClient(url, credential);
    const nft_nba_token = await secretClient.getSecret(secretName).then(result => result.value);

    // get athletes from sportsdata
    const sdAthleteList = await sportsDataRequest.getSportsdataAthletes("NFL");
    // get the current time
    const current_time = new Date();
    // get all files from storage
    var storage = await nftStorageRequest.fetchStorage(nft_nba_token);

    // seperate list of athletes and athlete file directory
    var storage_athlete_list;
    var athlete_directory;

    // if both files exist
    if (storage.length == 2) {
        if (storage[0].size > storage[1].size) {
            athlete_directory = storage[0];
            storage_athlete_list = storage[1];
        }
        else {
            athlete_directory = storage[1];
            storage_athlete_list = storage[0];
        }
    }
    // else, only the athlete list should exist
    else {
        storage_athlete_list = storage[0];
        athlete_directory = null;
    }
    
    storage_athlete_list = await nftStorageRequest.fetchDesiredAthleteList(storage_athlete_list, nft_nba_token);
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
        this.computePrice(current_athlete, current_time);

        // add needed vars to new athlete
        var cur_athlete_json = {
            ID: current_athlete.PlayerID,
            Team: current_athlete.Team,
            Name: current_athlete.Name,
            Position: current_athlete.Position,
            PassingYards: current_athlete.PassingYards,
            RushingYards: current_athlete.RushingYards,
            RushingTouchdowns: current_athlete.RushingTouchdowns,
            Receptions: current_athlete.Receptions,
            ReceivingYards: current_athlete.ReceivingYards,
            ReceivingTouchdowns: current_athlete.ReceivingTouchdowns,
            PassingTouchdowns: current_athlete.PassingTouchdowns,
            PassingInterceptions: current_athlete.PassingInterceptions,
            BookPrice: current_athlete.Price,
            Time: current_time,
        };

        // add the current athlete to the json list
        athlete_jsons.push(cur_athlete_json);
        // add the current athlete to the all athlete list
        all_athletes_json.push(cur_athlete_json);
        // add their hourly times to the json list
        const prices = await this.updatePriceList(file_list, current_athlete, athlete_directory, current_time, nft_nba_token);
        athlete_jsons.push(
            {
                ID: current_athlete.PlayerID+"_history",
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
    nftStorageRequest.uploadAndDelete(athlete_jsons, athlete_directory, nft_nba_token);
  }

  async updatePriceList(files, athlete, directory, time, token) {
    const nftStorageRequest = new NFT_Storage_Request();

    let file = athlete.PlayerID + "_history";
    let current_price = athlete.Price;

    // if there is no file, return [[hour],[day]]
    if (!files.includes(file)) {
        return [
            [ {Price: current_price, Time: time} ],
            [ {Price: current_price, Time: time} ],
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
    
    // if at past capacity, delete first few until at capacity
    while (prices.length > NUM_PRICE_ENTRIES) {
        // removes first
        prices.shift();
    }

    // if at max capacity, remove and add
    if (time_update && prices.length == NUM_PRICE_ENTRIES) {
        // removes first
        prices.shift();
        prices.push( {Price: current_price, Time: time} );
    }
    // if not at max capacity, just add
    else if (time_update) {
        prices.push( {Price: current_price, Time: time} );
    }

    // return prices
    return prices;
  }

  computePrice(athlete, time) {
    try {
        athlete.Time = time;
        var numerator = athlete.PassingYards +
            athlete.RushingYards +
            athlete.ReceivingYards +
            athlete.RushingTouchdowns +
            athlete.ReceivingTouchdowns +
            athlete.PassingTouchdowns +
            athlete.Receptions +
            athlete.PassingInterceptions +
            athlete.FumblesLost;
        
        var denominator = athlete.OffensiveSnapsPlayed;
        if (denominator == 0)
            denominator = athlete.DefensiveSnapsPlayed;
        if (Math.min(numerator, denominator) <= 0)
            athlete.Price = 0;
        else {
            var finalNFLPrice = numerator / denominator;

            // ensure price is in range of 0 and 1000
            if (finalNFLPrice < 0)
                athlete.Price = 0;
            else if (finalNFLPrice > 1000)
                athlete.Price = 1000;
            else 
                athlete.Price = finalNFLPrice;
        }
    } catch (error) {
        console.error(error);
    }
  }
}

module.exports = NFL_Function;