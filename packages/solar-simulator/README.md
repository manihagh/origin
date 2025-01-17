# EW Solar Simulator

## Overview

Consists of 2 services:

1. Simulation
2. Consumer

### Simulation

This is a service that simulates API for getting energy data. Based on asset configuration it returns mock data for solar assets, based on real data for whole year in 15-mins intervals. Simulation service exposes it's API for HTTP requests that Consumer service is using.

Run:
```
yarn start-simulation
```

or from the root of monorepo:

```
yarn run:simulator:server
```

### Consumer

Queries Simulation service for energy data for configured assets, and if it sees that there are new energy entries, it writes them to Origin blockchain smart-contracts as smart meter reads.

Run:
```
yarn start-consuming-api
```

or from the root of monorepo:

```
yarn run:simulator:consumer
```

## Configuration

To run simulator and consumer services you need to deploy Origin first.

### General

Edit `config/config.json` and configure:
- `ASSET_CONTRACT_LOOKUP_ADDRESS` - this is `AddressContractLookup` smart-contract address, you can get it via output of Origin deployment script ("info: Asset Contract Deployed: X", where X is the address you need)
- `WEB3_URL` - by default configured to local Ganache instance (`http://localhost:8545`), if you've deployed Origin to Volta, use: `https://volta-rpc.energyweb.org`
- `ENERGY_API_BASE_URL` - the address on which simulation process is running, by default locally it's `http://localhost:3031`, in Docker it's `http://simulation:3031`

### Asset

Edit asset configuration in `config/config.json`. Properties:
- `maxCapacity` - maximum asset capacity in Wh
- `smartMeterPrivateKey` - private key of smart meter device to save reads on-chain

Place example energy generation data in `config/data.csv` in the following format:

```
Time,E/Cap ratio (kWh/kW),5 MW example (kWh)
01.01.2015 00:00,0,0.00
01.01.2015 00:15,0,0.00
01.01.2015 07:45,0.000664,3.32
```

### How to import I-REC public assets

I-REC lists all public registered assets in https://registry.irecservices.com/Public/ReportDevices/ where you can filter and download public assets as CSV file.

We have created 2 scripts to allow easy import of those assets.

#### import-irec-assets script

```
Usage: yarn import-irec-assets -- [options]

Options:
  -i, --input <path>       input I-REC csv file
  -o, --owner <address>    address of the asset owner
  -m, --matcher <address>  address of the asset matcher
  -h, --help               output usage information
```

As an outcome of running this script we will receive 2 products:

1. new `config/config.json` with updated `assets` field based on input CSV file
2. json console output with commands necessary to setup demo environement https://github.com/energywebfoundation/ew-utils-demo/blob/master/config/demo-config.json


#### fund-assets-smart-meters script

```
Usage: yarn fund-assets-smart-meters -- [options]

Options:
  -f, --fundingAccount <string>  funding account private key
  -v, --value <ewt>              value of the funding tx (default: 1EWT) (default: "1")
  -h, --help                     output usage information
```

Before we can setup the demo environement, newly generated smart meters wallets have to be funded with EWF token. Script is using `config/config.json` `WEB3_URL` variable to connect to given web3 endpoint.
