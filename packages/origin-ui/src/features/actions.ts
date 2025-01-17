import { Demand } from '@energyweb/market';
import { ConsumingAsset } from '@energyweb/asset-registry';
import { Configuration } from '@energyweb/utils-general';

export enum Actions {
    demandCreated = 'DEMAND_CREATED',
    demandUpdated = 'DEMAND_UPDATED',
    demandDeleted = 'DEMAND_DELETED',
    producingAssetCreatedOrUpdated = 'PRODUCING_ASSET_CREATED_OR_UPDATED',
    consumingAssetCreatedOrUpdated = 'CONSUMING_ASSET_CREATED_OR_UPDATED',
    configurationUpdated = 'CONFIGURATION_UPDATED'
}

export const demandCreated = (demand: Demand.Entity) => ({
    type: Actions.demandCreated,
    demand
});

export const demandUpdated = (demand: Demand.Entity) => ({
    type: Actions.demandUpdated,
    demand
});

export const demandDeleted = (demand: Demand.Entity) => ({
    type: Actions.demandDeleted,
    demand
});

export const consumingAssetCreatedOrUpdated = (consumingAsset: ConsumingAsset.Entity) => ({
    type: Actions.consumingAssetCreatedOrUpdated,
    consumingAsset
});

export const configurationUpdated = (conf: Configuration.Entity) => ({
    type: Actions.configurationUpdated,
    conf
});
