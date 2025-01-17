import * as React from 'react';
import moment, { Moment } from 'moment';
import { Configuration } from '@energyweb/utils-general';
import { CertificateLogic } from '@energyweb/origin';
import { ProducingAsset } from '@energyweb/asset-registry';
import { showNotification, NotificationType } from '../../utils/notifications';
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField
} from '@material-ui/core';
import { DatePicker } from '@material-ui/pickers';

interface IRequestIRECsModalProps {
    conf: Configuration.Entity;
    producingAsset: ProducingAsset.Entity;
    showModal: boolean;
    callback: () => void;
}

interface IRequestIRECsModalState {
    show: boolean;
    fromDate: Date;
    toDate: Moment;
    reads: any[];
}

export class RequestIRECsModal extends React.Component<
    IRequestIRECsModalProps,
    IRequestIRECsModalState
> {
    constructor(props, context) {
        super(props, context);

        this.handleClose = this.handleClose.bind(this);
        this.requestIRECs = this.requestIRECs.bind(this);
        this.isFormValid = this.isFormValid.bind(this);
        this.handleToDateChange = this.handleToDateChange.bind(this);

        this.state = {
            show: props.showModal,
            fromDate: moment().toDate(),
            toDate: this.setMaxTimeInDay(moment()),
            reads: []
        };
    }

    UNSAFE_componentWillReceiveProps(newProps: IRequestIRECsModalProps) {
        this.setState({
            show: newProps.showModal
        });
    }

    async componentDidUpdate(prevProps: IRequestIRECsModalProps) {
        if (this.props.producingAsset && this.props.producingAsset !== prevProps.producingAsset) {
            const reads = await this.props.producingAsset.getSmartMeterReads();

            const certificateLogic: CertificateLogic = this.props.conf.blockchainProperties
                .certificateLogicInstance;

            const requestedSMReadsLength = Number(
                await certificateLogic.getAssetRequestedCertsForSMReadsLength(
                    Number(this.props.producingAsset.id)
                )
            );

            const fromDate = moment.unix(reads[requestedSMReadsLength].timestamp).toDate();

            this.setState({
                reads,
                fromDate
            });
        }
    }

    async requestIRECs() {
        const certificateLogic: CertificateLogic = this.props.conf.blockchainProperties
            .certificateLogicInstance;

        const readsInRange = this.getReadsInTimeRange(this.state.fromDate, this.state.toDate);
        const lastReadIndex = this.state.reads.indexOf(readsInRange[readsInRange.length - 1]);

        await certificateLogic.requestCertificates(
            Number(this.props.producingAsset.id),
            lastReadIndex
        );

        const energy = this.getEnergy(this.state.fromDate, this.state.toDate) / 1000;

        showNotification(`Certificates for ${energy} kWh requested.`, NotificationType.Success);

        this.handleClose();
    }

    isFormValid(): boolean {
        const { fromDate, toDate } = this.state;

        if (!fromDate || !toDate) {
            return false;
        }

        return fromDate <= toDate.toDate();
    }

    handleClose() {
        this.props.callback();
        this.setState({ show: false });
    }

    setMaxTimeInDay(date: Moment): Moment {
        return date
            .hours(23)
            .minutes(59)
            .seconds(59)
            .milliseconds(999);
    }

    async handleToDateChange(date: Moment) {
        this.setState({
            toDate: this.setMaxTimeInDay(date),
            energy: this.getEnergy(this.state.fromDate, date)
        } as any);
    }

    getReadsInTimeRange(fromDate, toDate) {
        const fromTimestamp = moment(fromDate).unix();
        const toTimestamp = moment(toDate).unix();

        return this.state.reads.filter(
            read => Number(read.timestamp) <= toTimestamp && Number(read.timestamp) >= fromTimestamp
        );
    }

    getEnergy(fromDate, toDate) {
        if (!this.props.producingAsset) {
            return 0;
        }

        return this.getReadsInTimeRange(fromDate, toDate).reduce((a, b) => a + Number(b.energy), 0);
    }

    render() {
        const assetId = this.props.producingAsset ? this.props.producingAsset.id : '';

        return (
            <Dialog open={this.state.show} onClose={this.handleClose}>
                <DialogTitle>{`Request I-RECs for Asset #${assetId}`}</DialogTitle>
                <DialogContent>
                    <TextField
                        label="From"
                        value={moment(this.state.fromDate).format('YYYY-MM-DD')}
                        fullWidth
                        disabled
                    />

                    <DatePicker
                        label={'To'}
                        value={this.state.toDate}
                        onChange={this.handleToDateChange}
                        variant="inline"
                        inputVariant="filled"
                        className="mt-4"
                        fullWidth
                    />

                    <TextField
                        label="kWh"
                        value={this.getEnergy(this.state.fromDate, this.state.toDate) / 1000}
                        className="mt-4"
                        fullWidth
                        disabled
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={this.handleClose} color="secondary">
                        Cancel
                    </Button>
                    <Button
                        onClick={this.requestIRECs}
                        color="primary"
                        disabled={!this.isFormValid()}
                    >
                        Request
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }
}
