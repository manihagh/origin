// Copyright 2018 Energy Web Foundation
// This file is part of the Origin Application brought to you by the Energy Web Foundation,
// a global non-profit organization focused on accelerating blockchain technology across the energy sector,
// incorporated in Zug, Switzerland.
//
// The Origin Application is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// This is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY and without an implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details, at <http://www.gnu.org/licenses/>.
//
// @authors: slock.it GmbH; Heiko Burkhardt, heiko.burkhardt@slock.it; Martin Kuechler, martin.kuchler@slock.it

import { ContractEventHandler } from './ContractEventHandler';
import * as Configuration from './Configuration';

export class EventHandlerManager {
    private contractEventHandlers: ContractEventHandler[];
    private tickTime: number;
    private running: boolean;
    private configuration: Configuration.Entity;

    constructor(tickTime: number, configuration: Configuration.Entity) {
        this.tickTime = tickTime;
        this.configuration = configuration;
        this.contractEventHandlers = [];
    }

    registerEventHandler(eventHandler: ContractEventHandler) {
        this.contractEventHandlers.push(eventHandler);
    }

    start() {
        this.running = true;
        this.loop();
    }

    stop() {
        this.running = false;
    }

    async loop() {
        while (this.running) {
            this.contractEventHandlers.forEach((eventHandler: ContractEventHandler) =>
                eventHandler.tick(this.configuration)
            );
            await this.sleep(this.tickTime);
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
