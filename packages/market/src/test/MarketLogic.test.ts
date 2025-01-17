import 'mocha';

import { AssetContractLookup, AssetProducingRegistryLogic } from '@energyweb/asset-registry';
import { migrateAssetRegistryContracts } from '@energyweb/asset-registry/contracts';
import { buildRights, Role, UserLogic } from '@energyweb/user-registry';
import { migrateUserRegistryContracts } from '@energyweb/user-registry/contracts';
import { migrateCertificateRegistryContracts } from '@energyweb/origin/contracts';
import { assert } from 'chai';
import * as fs from 'fs';
import Web3 from 'web3';

import { MarketContractLookupJSON, MarketDBJSON, MarketLogicJSON } from '../../contracts';
import { DemandStatus } from '../blockchain-facade/Demand';
import { migrateMarketRegistryContracts } from '../utils/migrateContracts';
import { MarketContractLookup } from '../wrappedContracts/MarketContractLookup';
import { MarketDB } from '../wrappedContracts/MarketDB';
import { MarketLogic } from '../wrappedContracts/MarketLogic';

describe('MarketLogic', () => {
    const configFile = JSON.parse(
        fs.readFileSync(`${process.cwd()}/connection-config.json`, 'utf8')
    );

    const web3 = new Web3(configFile.develop.web3);

    const privateKeyDeployment = configFile.develop.deployKey.startsWith('0x')
        ? configFile.develop.deployKey
        : `0x${configFile.develop.deployKey}`;

    const accountDeployment = web3.eth.accounts.privateKeyToAccount(privateKeyDeployment).address;

    let assetRegistryContract: AssetContractLookup;
    let marketRegistryContract: MarketContractLookup;
    let marketDB: MarketDB;
    let marketLogic: MarketLogic;
    let isGanache: boolean;
    let userContractLookupAddr;
    let userLogic: UserLogic;
    let assetRegistry: AssetProducingRegistryLogic;

    const assetOwnerPK = '0xc118b0425221384fe0cbbd093b2a81b1b65d0330810e0792c7059e518cea5383';
    const accountAssetOwner = web3.eth.accounts.privateKeyToAccount(assetOwnerPK).address;

    const traderPK = '0x2dc5120c26df339dbd9861a0f39a79d87e0638d30fdedc938861beac77bbd3f5';
    const accountTrader = web3.eth.accounts.privateKeyToAccount(traderPK).address;

    const trader2PK = '0xfaab95e72c3ac39f7c060125d9eca3558758bb248d1a4cdc9c1b7fd3f91a4485';
    const accountTrader2 = web3.eth.accounts.privateKeyToAccount(trader2PK).address;

    const testStatusChange = async (
        demandId: string,
        status: DemandStatus,
        hasChanged: boolean,
        user: string = traderPK
    ) => {
        const demand = await marketLogic.getDemand(demandId);

        const tx = await marketLogic.changeDemandStatus(demandId, status, {
            privateKey: user
        });

        const { _status } = await marketLogic.getDemand(demandId);
        assert.equal(_status, hasChanged ? status : demand._status);

        const events = await marketLogic.getEvents('DemandStatusChanged', {
            fromBlock: tx.blockNumber,
            toBlock: tx.blockNumber
        });

        assert.equal(events.length, hasChanged ? 1 : 0);
    };

    it('should deploy the contracts', async () => {
        isGanache = true;
        const userContracts = await migrateUserRegistryContracts(web3, privateKeyDeployment);

        userLogic = new UserLogic(web3 as any, (userContracts as any).UserLogic);
        await userLogic.createUser(
            'propertiesDocumentHash',
            'documentDBURL',
            accountDeployment,
            'admin',
            { privateKey: privateKeyDeployment }
        );

        await userLogic.setRoles(accountDeployment, 3, { privateKey: privateKeyDeployment });

        userContractLookupAddr = (userContracts as any).UserContractLookup;

        const assetContracts = await migrateAssetRegistryContracts(
            web3,
            userContractLookupAddr,
            privateKeyDeployment
        );

        const assetRegistryLookupAddr = (assetContracts as any).AssetContractLookup;

        const originContracts = await migrateCertificateRegistryContracts(
            web3,
            assetRegistryLookupAddr,
            privateKeyDeployment
        );

        const originLookupAddr = (originContracts as any).OriginContractLookup;

        const marketContracts = await migrateMarketRegistryContracts(
            web3,
            assetRegistryLookupAddr,
            originLookupAddr,
            privateKeyDeployment
        );

        assetRegistryContract = new AssetContractLookup(web3 as any, assetRegistryLookupAddr);
        assetRegistry = new AssetProducingRegistryLogic(
            web3,
            (assetContracts as any).AssetProducingRegistryLogic
        );
        for (const key of Object.keys(marketContracts)) {
            let tempBytecode;
            if (key.includes('MarketContractLookup')) {
                marketRegistryContract = new MarketContractLookup(web3, marketContracts[key]);
                tempBytecode = MarketContractLookupJSON.deployedBytecode;
            }

            if (key.includes('MarketLogic')) {
                marketLogic = new MarketLogic(web3, marketContracts[key]);
                tempBytecode = MarketLogicJSON.deployedBytecode;
            }

            if (key.includes('MarketDB')) {
                marketDB = new MarketDB(web3, marketContracts[key]);
                tempBytecode = MarketDBJSON.deployedBytecode;
            }
            const deployedBytecode = await web3.eth.getCode(marketContracts[key]);
            assert.isTrue(deployedBytecode.length > 0);

            assert.equal(deployedBytecode, tempBytecode);
        }
    });

    it('should have the right owner', async () => {
        assert.equal(await marketLogic.owner(), marketRegistryContract.web3Contract._address);
    });

    it('should have the lookup-contracts', async () => {
        assert.equal(
            await marketLogic.assetContractLookup(),
            assetRegistryContract.web3Contract._address
        );
        assert.equal(await marketLogic.userContractLookup(), userContractLookupAddr);
    });

    it('should have the right db', async () => {
        assert.equal(await marketLogic.db(), marketDB.web3Contract._address);
    });

    it('should fail when trying to call init', async () => {
        let failed = false;

        try {
            await marketLogic.init(
                '0x1000000000000000000000000000000000000005',
                '0x1000000000000000000000000000000000000005',
                { privateKey: privateKeyDeployment }
            );
        } catch (ex) {
            failed = true;
            assert.include(ex.message, 'msg.sender is not owner');
        }
        assert.isTrue(failed);
    });

    it('should fail when trying to call update', async () => {
        let failed = false;

        try {
            await marketLogic.update('0x1000000000000000000000000000000000000005', {
                privateKey: privateKeyDeployment
            });
        } catch (ex) {
            failed = true;
            assert.include(ex.message, 'msg.sender is not owner');
        }
        assert.isTrue(failed);
    });

    it('should have 0 elements in allDemands', async () => {
        assert.equal(await marketLogic.getAllDemandListLength(), 0);
    });

    it('should throw an error when trying to access a non existing demand', async () => {
        let failed = false;
        try {
            await marketLogic.getDemand('0');
        } catch (ex) {
            failed = true;
        }

        assert.isTrue(failed);
    });

    it('should fail when trying to create a demand as userAdmin', async () => {
        let failed = false;
        try {
            await marketLogic.createDemand('propertiesDocumentHash', 'documentDBURL', {
                privateKey: privateKeyDeployment
            });
        } catch (ex) {
            failed = true;
            if (isGanache) {
                assert.include(ex.message, 'user does not have the required role');
            }
        }

        assert.isTrue(failed);
    });

    it('should fail when trying to create a demand as non registered user', async () => {
        let failed = false;
        try {
            await marketLogic.createDemand('propertiesDocumentHash', 'documentDBURL', {
                privateKey: traderPK
            });
        } catch (ex) {
            failed = true;
            assert.include(ex.message, 'user does not have the required role');
        }

        assert.isTrue(failed);
    });

    it('should set right roles to users', async () => {
        await userLogic.createUser(
            'propertiesDocumentHash',
            'documentDBURL',
            accountTrader,
            'trader',
            { privateKey: privateKeyDeployment }
        );
        await userLogic.createUser(
            'propertiesDocumentHash',
            'documentDBURL',
            accountTrader2,
            'trader',
            { privateKey: privateKeyDeployment }
        );
        await userLogic.createUser(
            'propertiesDocumentHash',
            'documentDBURL',
            accountAssetOwner,
            'assetOwner',
            { privateKey: privateKeyDeployment }
        );

        await userLogic.setRoles(accountTrader, buildRights([Role.Trader]), {
            privateKey: privateKeyDeployment
        });
        await userLogic.setRoles(accountTrader2, buildRights([Role.Trader]), {
            privateKey: privateKeyDeployment
        });
        await userLogic.setRoles(accountAssetOwner, buildRights([Role.AssetManager]), {
            privateKey: privateKeyDeployment
        });
    });

    it('should fail when trying to create a demand as assetOwner', async () => {
        let failed = false;
        try {
            await marketLogic.createDemand('propertiesDocumentHash', 'documentDBURL', {
                privateKey: assetOwnerPK
            });
        } catch (ex) {
            failed = true;
            assert.include(ex.message, 'user does not have the required role');
        }

        assert.isTrue(failed);
    });

    it('should create a demand as trader', async () => {
        const tx = await marketLogic.createDemand('propertiesDocumentHash', 'documentDBURL', {
            privateKey: traderPK
        });

        const allEvents = await marketLogic.getEvents('createdNewDemand', {
            fromBlock: tx.blockNumber,
            toBlock: tx.blockNumber
        });

        assert.equal(allEvents.length, 1);

        const createDemandEvent = allEvents[0];
        assert.equal(createDemandEvent.event, 'createdNewDemand');
        assert.deepEqual(createDemandEvent.returnValues, {
            0: accountTrader,
            1: '0',
            _sender: accountTrader,
            _demandId: '0'
        });
    });

    it('should get a demand', async () => {
        const demand = await marketLogic.getDemand('0');
        demand[2] = demand[2].toLowerCase();
        demand._owner = demand._owner.toLowerCase();

        assert.deepEqual(demand, {
            0: 'propertiesDocumentHash',
            1: 'documentDBURL',
            2: accountTrader.toLowerCase(),
            3: '0',
            _propertiesDocumentHash: 'propertiesDocumentHash',
            _documentDBURL: 'documentDBURL',
            _owner: accountTrader.toLowerCase(),
            _status: '0'
        });
    });

    it('should have 1 demand in demandList', async () => {
        assert.equal(await marketLogic.getAllDemandListLength(), 1);
    });

    it('should fail when trying to create a supply with an non-existing asset as assetOwner', async () => {
        let failed = false;
        try {
            await marketLogic.createSupply('propertiesDocumentHash', 'documentDBURL', 1, {
                privateKey: assetOwnerPK
            });
        } catch (ex) {
            failed = true;
        }

        assert.isTrue(failed);
    });

    it('should fail when trying to create a supply with an non-existing asset as trader', async () => {
        let failed = false;
        try {
            await marketLogic.createSupply('propertiesDocumentHash', 'documentDBURL', 1, {
                privateKey: traderPK
            });
        } catch (ex) {
            failed = true;
        }

        assert.isTrue(failed);
    });

    it('should fail when trying to create a supply with an non-existing asset as admin', async () => {
        let failed = false;
        try {
            await marketLogic.createSupply('propertiesDocumentHash', 'documentDBURL', 1, {
                privateKey: privateKeyDeployment
            });
        } catch (ex) {
            failed = true;
        }

        assert.isTrue(failed);
    });

    it('should onboard an asset', async () => {
        await assetRegistry.createAsset(
            '0x1000000000000000000000000000000000000005',
            accountAssetOwner,
            true,
            'propertiesDocumentHash',
            'url',
            10,
            {
                privateKey: privateKeyDeployment
            }
        );
    });

    it('should fail when trying to create a supply with an non-existing asset as trader', async () => {
        let failed = false;
        try {
            await marketLogic.createSupply('propertiesDocumentHash', 'documentDBURL', 0, {
                privateKey: traderPK
            });
        } catch (ex) {
            failed = true;
        }

        assert.isTrue(failed);
    });

    it('should fail when trying to create a supply with an non-existing asset as admin', async () => {
        let failed = false;
        try {
            await marketLogic.createSupply('propertiesDocumentHash', 'documentDBURL', 0, {
                privateKey: privateKeyDeployment
            });
        } catch (ex) {
            failed = true;
        }

        assert.isTrue(failed);
    });

    it('should have 0 elements in supplyList', async () => {
        assert.equal(await marketLogic.getAllSupplyListLength(), 0);
    });

    it('should create a supply as assetOwner', async () => {
        const tx = await marketLogic.createSupply('propertiesDocumentHash', 'documentDBURL', 0, {
            privateKey: assetOwnerPK
        });

        const allEvents = await marketLogic.getEvents('createdNewSupply', {
            fromBlock: tx.blockNumber,
            toBlock: tx.blockNumber
        });

        assert.equal(allEvents.length, 1);
        const createEvent = allEvents[0];

        assert.equal(createEvent.event, 'createdNewSupply');
        assert.deepEqual(createEvent.returnValues, {
            0: accountAssetOwner,
            1: '0',
            _sender: accountAssetOwner,
            _supplyId: '0'
        });
    });

    it('should have 1 elements in supplyList', async () => {
        assert.equal(await marketLogic.getAllSupplyListLength(), 1);
    });

    it('should fail when trying to create an agreement with a non-existing supply as admin', async () => {
        let failed = false;
        try {
            await marketLogic.createAgreement('propertiesDocumentHash', 'documentDBURL', 0, 1, {
                privateKey: privateKeyDeployment
            });
        } catch (ex) {
            failed = true;
        }

        assert.isTrue(failed);
    });

    it('should fail when trying to create an agreement with a non-existing supply as assetOwner', async () => {
        let failed = false;
        try {
            await marketLogic.createAgreement('propertiesDocumentHash', 'documentDBURL', 0, 1, {
                privateKey: assetOwnerPK
            });
        } catch (ex) {
            failed = true;
        }

        assert.isTrue(failed);
    });

    it('should fail when trying to create an agreement with a non-existing supply as trader', async () => {
        let failed = false;
        try {
            await marketLogic.createAgreement('propertiesDocumentHash', 'documentDBURL', 0, 1, {
                privateKey: traderPK
            });
        } catch (ex) {
            failed = true;
        }

        assert.isTrue(failed);
    });

    it('should fail when trying to create an agreement with a non-existing demand as admin', async () => {
        let failed = false;
        try {
            await marketLogic.createAgreement('propertiesDocumentHash', 'documentDBURL', 1, 0, {
                privateKey: privateKeyDeployment
            });
        } catch (ex) {
            failed = true;
        }

        assert.isTrue(failed);
    });

    it('should fail when trying to create an agreement with a non-existing demand as assetOwner', async () => {
        let failed = false;
        try {
            await marketLogic.createAgreement('propertiesDocumentHash', 'documentDBURL', 1, 0, {
                privateKey: assetOwnerPK
            });
        } catch (ex) {
            failed = true;
        }

        assert.isTrue(failed);
    });

    it('should fail when trying to create an agreement with a non-existing demand as trader', async () => {
        let failed = false;
        try {
            await marketLogic.createAgreement('propertiesDocumentHash', 'documentDBURL', 1, 0, {
                privateKey: traderPK
            });
        } catch (ex) {
            failed = true;
        }

        assert.isTrue(failed);
    });

    it('should fail when trying to create an agreement with a non-existing demand and non-existing supply as admin', async () => {
        let failed = false;
        try {
            await marketLogic.createAgreement('propertiesDocumentHash', 'documentDBURL', 1, 1, {
                privateKey: privateKeyDeployment
            });
        } catch (ex) {
            failed = true;
        }

        assert.isTrue(failed);
    });

    it('should fail when trying to create an agreement with a non-existing demand and non-existing supply as assetOwner', async () => {
        let failed = false;
        try {
            await marketLogic.createAgreement('propertiesDocumentHash', 'documentDBURL', 1, 1, {
                privateKey: assetOwnerPK
            });
        } catch (ex) {
            failed = true;
        }

        assert.isTrue(failed);
    });

    it('should fail when trying to create an agreement with a non-existing demand and non-existing supply as trader', async () => {
        let failed = false;
        try {
            await marketLogic.createAgreement('propertiesDocumentHash', 'documentDBURL', 1, 1, {
                privateKey: traderPK
            });
        } catch (ex) {
            failed = true;
        }

        assert.isTrue(failed);
    });

    it('should fail when trying to create an agreement as admin', async () => {
        let failed = false;
        try {
            await marketLogic.createAgreement('propertiesDocumentHash', 'documentDBURL', 0, 0, {
                privateKey: privateKeyDeployment
            });
        } catch (ex) {
            failed = true;
            assert.include(ex.message, 'createDemand: wrong owner when creating');
        }

        assert.isTrue(failed);
    });

    it('should throw an error when accessing a non existing-agreement', async () => {
        let failed = false;
        try {
            await marketLogic.getAgreement(0);
        } catch (ex) {
            failed = true;
        }

        assert.isTrue(failed);
    });

    it('should have 0 agreements in list', async () => {
        assert.equal(await marketLogic.getAllAgreementListLength(), 0);
    });

    it('should create an agreement as assetOwner', async () => {
        const tx = await marketLogic.createAgreement(
            'propertiesDocumentHash',
            'documentDBURL',
            0,
            0,
            { privateKey: assetOwnerPK }
        );

        if (isGanache) {
            const allEvents = await marketLogic.getEvents('LogAgreementCreated', {
                fromBlock: tx.blockNumber,
                toBlock: tx.blockNumber
            });

            assert.equal(allEvents.length, 1);
            const agreementEvent = allEvents[0];
            assert.equal(agreementEvent.event, 'LogAgreementCreated');
            assert.deepEqual(agreementEvent.returnValues, {
                0: '0',
                1: '0',
                2: '0',
                _agreementId: '0',
                _demandId: '0',
                _supplyId: '0'
            });
        }
    });

    it('should be able to approve agreement again as supplyOwner', async () => {
        await marketLogic.approveAgreementSupply(0, { privateKey: assetOwnerPK });
    });

    it('should have 1 agreements in list', async () => {
        assert.equal(await marketLogic.getAllAgreementListLength(), 1);
    });

    it('should fail when trying to call approveAgreementDemand as assetOwner', async () => {
        let failed = false;
        try {
            await marketLogic.approveAgreementDemand(0, { privateKey: assetOwnerPK });
        } catch (ex) {
            failed = true;
            assert.include(ex.message, 'approveAgreementDemand: wrong msg.sender');
        }

        assert.isTrue(failed);
    });

    it('should fail when trying to call approveAgreementDemand as admin', async () => {
        let failed = false;
        try {
            await marketLogic.approveAgreementDemand(0, {
                privateKey: privateKeyDeployment
            });
        } catch (ex) {
            failed = true;
            assert.include(ex.message, 'approveAgreementDemand: wrong msg.sender');
        }

        assert.isTrue(failed);
    });

    it('should return the (not yet full) agreement', async () => {
        const agreement = await marketLogic.getAgreement(0);

        assert.deepEqual(agreement, {
            0: 'propertiesDocumentHash',
            1: 'documentDBURL',
            2: '0',
            3: '0',
            4: true,
            5: false,
            _propertiesDocumentHash: 'propertiesDocumentHash',
            _documentDBURL: 'documentDBURL',
            _demandId: '0',
            _supplyId: '0',
            _approvedBySupplyOwner: true,
            _approvedByDemandOwner: false
        });
    });

    it('should be able to approve agreementDemand as trader', async () => {
        const tx = await marketLogic.approveAgreementDemand(0, { privateKey: traderPK });

        if (isGanache) {
            const allEvents = await marketLogic.getEvents('LogAgreementFullySigned', {
                fromBlock: tx.blockNumber,
                toBlock: tx.blockNumber
            });
            assert.equal(allEvents.length, 1);
            const signedEvent = allEvents[0];

            assert.equal(signedEvent.event, 'LogAgreementFullySigned');
            assert.deepEqual(signedEvent.returnValues, {
                0: '0',
                1: '0',
                2: '0',
                _agreementId: '0',
                _demandId: '0',
                _supplyId: '0'
            });
        }
    });

    it('should return the full agreement', async () => {
        const agreement = await marketLogic.getAgreement(0);

        assert.deepEqual(agreement, {
            0: 'propertiesDocumentHash',
            1: 'documentDBURL',
            2: '0',
            3: '0',
            4: true,
            5: true,
            _propertiesDocumentHash: 'propertiesDocumentHash',
            _documentDBURL: 'documentDBURL',
            _demandId: '0',
            _supplyId: '0',
            _approvedBySupplyOwner: true,
            _approvedByDemandOwner: true
        });
    });

    it('should create a 2nd supply as assetOwner', async () => {
        const tx = await marketLogic.createSupply(
            'propertiesDocumentHash_2',
            'documentDBURL_2',
            0,
            { privateKey: assetOwnerPK }
        );

        const allEvents = await marketLogic.getEvents('createdNewSupply', {
            fromBlock: tx.blockNumber,
            toBlock: tx.blockNumber
        });

        assert.equal(allEvents.length, 1);
        const createEvent = allEvents[0];

        assert.equal(createEvent.event, 'createdNewSupply');
        assert.deepEqual(createEvent.returnValues, {
            0: accountAssetOwner,
            1: '1',
            _sender: accountAssetOwner,
            _supplyId: '1'
        });
    });

    it('should create a 2nd demand as trader', async () => {
        const tx = await marketLogic.createDemand('propertiesDocumentHash_2', 'documentDBURL_2', {
            privateKey: traderPK
        });

        if (isGanache) {
            const allEvents = await marketLogic.getEvents('createdNewDemand', {
                fromBlock: tx.blockNumber,
                toBlock: tx.blockNumber
            });

            assert.equal(allEvents.length, 1);

            const createDemandEvent = allEvents[0];
            assert.equal(createDemandEvent.event, 'createdNewDemand');
            assert.deepEqual(createDemandEvent.returnValues, {
                0: accountTrader,
                1: '1',
                _sender: accountTrader,
                _demandId: '1'
            });
        }
    });

    it('should create an agreement as trader', async () => {
        const tx = await marketLogic.createAgreement(
            'propertiesDocumentHash_2',
            'documentDBURL_2',
            1,
            1,
            { privateKey: traderPK }
        );

        if (isGanache) {
            const allEvents = await marketLogic.getEvents('LogAgreementCreated', {
                fromBlock: tx.blockNumber,
                toBlock: tx.blockNumber
            });

            assert.equal(allEvents.length, 1);
            const agreementEvent = allEvents[0];
            assert.equal(agreementEvent.event, 'LogAgreementCreated');
            assert.deepEqual(agreementEvent.returnValues, {
                0: '1',
                1: '1',
                2: '1',
                _agreementId: '1',
                _demandId: '1',
                _supplyId: '1'
            });
        }
    });

    it('should return the (not yet full) 2nd agreement', async () => {
        const agreement = await marketLogic.getAgreement(1);

        assert.deepEqual(agreement, {
            0: 'propertiesDocumentHash_2',
            1: 'documentDBURL_2',
            2: '1',
            3: '1',
            4: false,
            5: true,
            _propertiesDocumentHash: 'propertiesDocumentHash_2',
            _documentDBURL: 'documentDBURL_2',
            _demandId: '1',
            _supplyId: '1',
            _approvedBySupplyOwner: false,
            _approvedByDemandOwner: true
        });
    });

    it('should be able to approve 2nd agreement again as supplyOwner', async () => {
        await marketLogic.approveAgreementDemand(1, { privateKey: traderPK });
    });

    it('should fail when trying to call approveAgreementSupply as admin', async () => {
        let failed = false;
        try {
            await marketLogic.approveAgreementSupply(1, {
                privateKey: privateKeyDeployment
            });
        } catch (ex) {
            failed = true;
            assert.include(ex.message, 'approveAgreementSupply: wrong msg.sender');
        }

        assert.isTrue(failed);
    });

    it('should fail when trying to call approveAgreementSupply as trader', async () => {
        let failed = false;
        try {
            await marketLogic.approveAgreementSupply(1, { privateKey: traderPK });
        } catch (ex) {
            failed = true;
            assert.include(ex.message, 'approveAgreementSupply: wrong msg.sender');
        }

        assert.isTrue(failed);
    });

    it('should be able to call approveAgreementSupply as assetOwner', async () => {
        const tx = await marketLogic.approveAgreementSupply(1, { privateKey: assetOwnerPK });

        if (isGanache) {
            const allEvents = await marketLogic.getEvents('LogAgreementFullySigned', {
                fromBlock: tx.blockNumber,
                toBlock: tx.blockNumber
            });
            assert.equal(allEvents.length, 1);
            const signedEvent = allEvents[0];

            assert.equal(signedEvent.event, 'LogAgreementFullySigned');
            assert.deepEqual(signedEvent.returnValues, {
                0: '1',
                1: '1',
                2: '1',
                _agreementId: '1',
                _demandId: '1',
                _supplyId: '1'
            });
        }
    });

    it('should return the  2nd agreement', async () => {
        const agreement = await marketLogic.getAgreement(1);

        assert.deepEqual(agreement, {
            0: 'propertiesDocumentHash_2',
            1: 'documentDBURL_2',
            2: '1',
            3: '1',
            4: true,
            5: true,
            _propertiesDocumentHash: 'propertiesDocumentHash_2',
            _documentDBURL: 'documentDBURL_2',
            _demandId: '1',
            _supplyId: '1',
            _approvedBySupplyOwner: true,
            _approvedByDemandOwner: true
        });
    });

    it('should have 2 agreements in list', async () => {
        assert.equal(await marketLogic.getAllAgreementListLength(), 2);
    });

    it('should create a 3rd agreement as trader', async () => {
        const tx = await marketLogic.createAgreement(
            'propertiesDocumentHash_3',
            'documentDBURL_3',
            1,
            1,
            { privateKey: traderPK }
        );

        const allEvents = await marketLogic.getEvents('LogAgreementCreated', {
            fromBlock: tx.blockNumber,
            toBlock: tx.blockNumber
        });

        assert.equal(allEvents.length, 1);
        const agreementEvent = allEvents[0];
        assert.equal(agreementEvent.event, 'LogAgreementCreated');
        assert.deepEqual(agreementEvent.returnValues, {
            0: '2',
            1: '1',
            2: '1',
            _agreementId: '2',
            _demandId: '1',
            _supplyId: '1'
        });
    });

    it('should create 3rd agreement', async () => {
        await marketLogic.approveAgreementSupply(2, { privateKey: assetOwnerPK });
    });

    it('should create a 4th agreement as assetOwner', async () => {
        const tx = await marketLogic.createAgreement(
            'propertiesDocumentHash_4',
            'documentDBURL_4',
            1,
            1,
            { privateKey: assetOwnerPK }
        );

        const allEvents = await marketLogic.getEvents('LogAgreementCreated', {
            fromBlock: tx.blockNumber,
            toBlock: tx.blockNumber
        });

        assert.equal(allEvents.length, 1);
        const agreementEvent = allEvents[0];
        assert.equal(agreementEvent.event, 'LogAgreementCreated');
        assert.deepEqual(agreementEvent.returnValues, {
            0: '3',
            1: '1',
            2: '1',
            _agreementId: '3',
            _demandId: '1',
            _supplyId: '1'
        });
    });

    it('should be able to create a 3rd demand', async () => {
        await marketLogic.createDemand('propertiesDocumentHash_deleted', 'documentDBURL_deleted', {
            privateKey: traderPK
        });
        assert.equal(await marketLogic.getAllDemandListLength(), 3);
    });

    it('should fail to delete a demand as non-trader', async () => {
        let failed = false;
        try {
            await marketLogic.deleteDemand('1', {
                privateKey: assetOwnerPK
            });
        } catch (ex) {
            failed = true;
            assert.include(ex.message, 'user does not have the required role');
        }

        assert.isTrue(failed);
    });

    it('should not be able to delete a demand as trader non-owner', async () => {
        let failed = false;
        try {
            await marketLogic.deleteDemand('1', {
                privateKey: trader2PK
            });
        } catch (ex) {
            failed = true;
            assert.include(ex.message, 'user is not the owner of this demand');
        }

        assert.isTrue(failed);
    });

    it('should be able to delete a demand as trader owner', async () => {
        const txDelete = await marketLogic.deleteDemand('1', {
            privateKey: traderPK
        });

        const archivedDemandStatusEvents = await marketLogic.getEvents('DemandStatusChanged', {
            fromBlock: txDelete.blockNumber,
            toBlock: txDelete.blockNumber
        });
        assert.equal(archivedDemandStatusEvents.length, 1);

        const demandAfter = await marketLogic.getDemand('1');
        assert.deepEqual(demandAfter, {
            0: 'propertiesDocumentHash_2',
            1: 'documentDBURL_2',
            2: '0xaf9DdE98b6aeB2225bf87C2cB91c58833fbab2Ab',
            3: DemandStatus.ARCHIVED.toString(),
            _propertiesDocumentHash: 'propertiesDocumentHash_2',
            _documentDBURL: 'documentDBURL_2',
            _owner: '0xaf9DdE98b6aeB2225bf87C2cB91c58833fbab2Ab',
            _status: DemandStatus.ARCHIVED.toString()
        });

        // Demand list length should remain the same, because the elements in Solidity are not automatically shifted
        assert.equal(await marketLogic.getAllDemandListLength(), 3);
    });

    it('should not emit event when status not changed', async () => {
        await testStatusChange('0', DemandStatus.ACTIVE, false);
    });

    it('should not be able to change demand status when no demand owner', async () => {
        let failed = false;
        try {
            await testStatusChange('0', DemandStatus.PAUSED, false, trader2PK);
        } catch (e) {
            failed = true;
        }

        assert.isTrue(failed);
    });

    it('should be able to set demand status to paused when current status is active', async () => {
        await testStatusChange('0', DemandStatus.PAUSED, true);
    });

    it('should be able to set demand status to active when current status is paused', async () => {
        await testStatusChange('0', DemandStatus.ACTIVE, true);
    });

    it('should be able to set demand status to archived when current status is active', async () => {
        await testStatusChange('0', DemandStatus.ARCHIVED, true);
    });

    it('should be not able to set demand status to active or paused when current status is archived', async () => {
        await testStatusChange('0', DemandStatus.ACTIVE, false);
        await testStatusChange('0', DemandStatus.PAUSED, false);
    });

    it('should be able to update url and hash', async () => {
        const tx = await marketLogic.createDemand('hash', 'url', {
            privateKey: traderPK
        });

        const events = await marketLogic.getEvents('createdNewDemand', {
            fromBlock: tx.blockNumber,
            toBlock: tx.blockNumber
        });

        const demandId = events[0].returnValues._demandId;

        const newHash = 'hashhash';
        const newUrl = 'urlurl';

        await marketLogic.updateDemand(demandId, newHash, newUrl, {
            privateKey: traderPK
        });

        const demandUpdatedEvents = await marketLogic.getEvents('DemandUpdated', {
            fromBlock: tx.blockNumber,
            toBlock: tx.blockNumber
        });

        const updatedDemandId = demandUpdatedEvents[0].returnValues._demandId;

        assert.equal(updatedDemandId, demandId);

        const { _status, _propertiesDocumentHash, _documentDBURL } = await marketLogic.getDemand(
            updatedDemandId
        );

        assert.equal(_status, DemandStatus.ACTIVE);
        assert.equal(_propertiesDocumentHash, newHash);
        assert.equal(_documentDBURL, newUrl);
    });
});
