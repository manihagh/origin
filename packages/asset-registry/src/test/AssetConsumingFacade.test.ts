import { assert } from 'chai';
import * as fs from 'fs';
import Web3 from 'web3';
import 'mocha';
import { Configuration } from '@energyweb/utils-general';
import { logger } from '../Logger';
import { UserContractLookup, UserLogic, buildRights, Role } from '@energyweb/user-registry';
import { migrateUserRegistryContracts } from '@energyweb/user-registry/contracts';
import { migrateAssetRegistryContracts } from '../../contracts';
import { Asset, ConsumingAsset, AssetConsumingRegistryLogic } from '..';

describe('AssetConsumingLogic Facade', () => {
    const configFile = JSON.parse(
        fs.readFileSync(process.cwd() + '/connection-config.json', 'utf8')
    );

    const web3 = new Web3(configFile.develop.web3);

    const privateKeyDeployment = configFile.develop.deployKey.startsWith('0x')
        ? configFile.develop.deployKey
        : '0x' + configFile.develop.deployKey;

    const accountDeployment = web3.eth.accounts.privateKeyToAccount(privateKeyDeployment).address;
    let conf: Configuration.Entity;

    let userContractLookup: UserContractLookup;
    let userContractLookupAddr: string;
    let assetConsumingLogic: AssetConsumingRegistryLogic;
    let userLogic: UserLogic;

    /*
    let assetContractLookup: AssetContractLookup;
    let assetProducingLogic: AssetProducingRegistryLogic;
    let assetProducingDB: AssetProducingDB;
    let assetConsumingDB: AssetConsumingDB;
    */

    const assetOwnerPK = '0xfaab95e72c3ac39f7c060125d9eca3558758bb248d1a4cdc9c1b7fd3f91a4485';
    const assetOwnerAddress = web3.eth.accounts.privateKeyToAccount(assetOwnerPK).address;

    const assetSmartmeterPK = '0x2dc5120c26df339dbd9861a0f39a79d87e0638d30fdedc938861beac77bbd3f5';
    const assetSmartmeter = web3.eth.accounts.privateKeyToAccount(assetSmartmeterPK).address;

    const assetSmartmeter2PK = '0x554f3c1470e9f66ed2cf1dc260d2f4de77a816af2883679b1dc68c551e8fa5ed';
    const assetSmartMeter2 = web3.eth.accounts.privateKeyToAccount(assetSmartmeter2PK).address;

    it('should deploy user-registry contracts', async () => {
        const userContracts = await migrateUserRegistryContracts(web3, privateKeyDeployment);
        userContractLookupAddr = (userContracts as any).UserContractLookup;
        userLogic = new UserLogic(web3, (userContracts as any).UserLogic);

        await userLogic.createUser(
            'propertiesDocumentHash',
            'documentDBURL',
            accountDeployment,
            'admin',
            { privateKey: privateKeyDeployment }
        );

        await userLogic.setRoles(
            accountDeployment,
            buildRights([Role.UserAdmin, Role.AssetAdmin]),
            { privateKey: privateKeyDeployment }
        );

        userContractLookup = new UserContractLookup(web3 as any, userContractLookupAddr);
    });

    it('should deploy asset-registry contracts', async () => {
        const deployedContracts = await migrateAssetRegistryContracts(
            web3,
            userContractLookupAddr,
            privateKeyDeployment
        );
        assetConsumingLogic = new AssetConsumingRegistryLogic(
            web3,
            (deployedContracts as any).AssetConsumingRegistryLogic
        );
    });

    it('should onboard tests-users', async () => {
        await userLogic.createUser(
            'propertiesDocumentHash',
            'documentDBURL',
            assetOwnerAddress,
            'assetOwner',
            { privateKey: privateKeyDeployment }
        );
        await userLogic.setRoles(
            assetOwnerAddress,
            buildRights([Role.AssetManager, Role.AssetAdmin]),
            { privateKey: privateKeyDeployment }
        );
    });

    it('should onboard a new asset', async () => {
        conf = {
            blockchainProperties: {
                activeUser: {
                    address: accountDeployment,
                    privateKey: privateKeyDeployment
                },
                consumingAssetLogicInstance: assetConsumingLogic,
                userLogicInstance: userLogic,
                web3
            },
            offChainDataSource: {
                baseUrl: 'http://localhost:3030'
            },
            logger
        };

        const assetProps: ConsumingAsset.IOnChainProperties = {
            certificatesUsedForWh: 0,
            smartMeter: { address: assetSmartmeter },
            owner: { address: assetOwnerAddress },
            lastSmartMeterReadWh: 0,
            active: true,
            lastSmartMeterReadFileHash: 'lastSmartMeterReadFileHash',
            propertiesDocumentHash: null,
            url: null
        };

        const assetPropsOffChain: Asset.IOffChainProperties = {
            operationalSince: 10,
            capacityWh: 10,
            country: 'Thailand',
            address:
                '95 Moo 7, Sa Si Mum Sub-district, Kamphaeng Saen District, Nakhon Province 73140',
            gpsLatitude: '0.0123123',
            gpsLongitude: '31.1231',
            facilityName: 'Wuthering Heights Windfarm'
        };

        assert.equal(await ConsumingAsset.getAssetListLength(conf), 0);

        const asset = await ConsumingAsset.createAsset(assetProps, assetPropsOffChain, conf);
        delete asset.configuration;
        delete asset.proofs;
        delete asset.propertiesDocumentHash;

        assert.deepEqual(
            {
                id: '0',
                initialized: true,
                smartMeter: { address: assetSmartmeter },
                owner: { address: assetOwnerAddress },
                lastSmartMeterReadWh: '0',
                active: true,
                lastSmartMeterReadFileHash: '',
                offChainProperties: assetPropsOffChain,
                url: 'http://localhost:3030/ConsumingAsset'
            } as any,
            asset
        );
        assert.equal(await ConsumingAsset.getAssetListLength(conf), 1);
    });

    it('should fail when onboarding the same asset again', async () => {
        const assetProps: ConsumingAsset.IOnChainProperties = {
            certificatesUsedForWh: 0,
            smartMeter: { address: assetSmartmeter },
            owner: { address: assetOwnerAddress },
            lastSmartMeterReadWh: 0,
            active: true,
            lastSmartMeterReadFileHash: 'lastSmartMeterReadFileHash',
            propertiesDocumentHash: null,
            url: null
        };

        const assetPropsOffChain: Asset.IOffChainProperties = {
            operationalSince: 10,
            capacityWh: 10,
            country: 'Thailand',
            address:
                '95 Moo 7, Sa Si Mum Sub-district, Kamphaeng Saen District, Nakhon Province 73140',
            gpsLatitude: '0.0123123',
            gpsLongitude: '31.1231',
            facilityName: 'Wuthering Heights Windfarm'
        };

        assert.equal(await ConsumingAsset.getAssetListLength(conf), 1);

        try {
            await ConsumingAsset.createAsset(assetProps, assetPropsOffChain, conf);
        } catch (e) {
            assert.include(e.message, 'smartmeter does already exist');
        }
        assert.equal(await ConsumingAsset.getAssetListLength(conf), 1);
    });

    it('should log a new meterreading', async () => {
        conf.blockchainProperties.activeUser = {
            address: assetSmartmeter,
            privateKey: assetSmartmeterPK
        };

        let asset = await new ConsumingAsset.Entity('0', conf).sync();

        await asset.saveSmartMeterRead(100, 'newFileHash');

        asset = await asset.sync();

        delete asset.proofs;
        delete asset.configuration;

        delete asset.propertiesDocumentHash;

        assert.deepEqual(asset as any, {
            id: '0',
            initialized: true,
            smartMeter: { address: assetSmartmeter },
            owner: { address: assetOwnerAddress },
            lastSmartMeterReadWh: '100',
            active: true,
            lastSmartMeterReadFileHash: 'newFileHash',
            url: 'http://localhost:3030/ConsumingAsset',
            offChainProperties: {
                operationalSince: 10,
                capacityWh: 10,
                country: 'Thailand',
                address:
                    '95 Moo 7, Sa Si Mum Sub-district, Kamphaeng Saen District, Nakhon Province 73140',
                gpsLatitude: '0.0123123',
                gpsLongitude: '31.1231',
                facilityName: 'Wuthering Heights Windfarm'
            }
        });
    });
});
