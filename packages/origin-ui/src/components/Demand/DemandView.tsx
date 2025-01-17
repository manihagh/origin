import { RouteComponentProps, withRouter } from 'react-router-dom';

import React from 'react';

import { DemandForm } from './DemandForm';

import { connect } from 'react-redux';

import { IStoreState } from '../../types';

import { getDemands } from '../../features/selectors';
import { Demand } from '@energyweb/market';

interface IMatchParams {
    key: string;
    id?: string;
}

interface IStateProps {
    demands: Demand.Entity[];
}

type Props = IStateProps & RouteComponentProps<IMatchParams>;

class DemandViewClass extends React.Component<Props> {
    render() {
        const demand = this.props.demands.find(d => d.id === this.props.match.params.id);

        return <DemandForm demand={demand} readOnly={true} />;
    }
}

export const DemandView = withRouter(
    connect(
        (state: IStoreState): IStateProps => ({
            demands: getDemands(state)
        })
    )(DemandViewClass)
);
