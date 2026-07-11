import { describe, test, expect } from '@jest/globals';
import { createPublishingService, PublishingService } from './publishing.service.js';
import { createDatabase } from '../../core/database.js';
import type { FederatedDiscoveryService } from "../network/federated-discovery.service.js";
import type { ActivityPubService } from "../activitypub/activitypub.service.js";
import type { ServerConfig } from "../../core/config.js";
import type { StorageEngine } from "../storage/storage.engine.js";

describe('createPublishingService', () => {
    test('creates and returns a new PublishingService instance', () => {
        const db = createDatabase(':memory:');
        const federatedDiscoveryMock = {} as unknown as FederatedDiscoveryService;
        const apMock = {} as unknown as ActivityPubService;
        const configMock = { server: { domain: 'example.com' } } as unknown as ServerConfig;
        const storageMock = {} as unknown as StorageEngine;

        const service = createPublishingService(db, federatedDiscoveryMock, apMock, configMock, storageMock);
        expect(service).toBeInstanceOf(PublishingService);
    });

    test('returns a new instance on each call', () => {
        const db = createDatabase(':memory:');
        const federatedDiscoveryMock = {} as unknown as FederatedDiscoveryService;
        const apMock = {} as unknown as ActivityPubService;
        const configMock = { server: { domain: 'example.com' } } as unknown as ServerConfig;
        const storageMock = {} as unknown as StorageEngine;

        const service1 = createPublishingService(db, federatedDiscoveryMock, apMock, configMock, storageMock);
        const service2 = createPublishingService(db, federatedDiscoveryMock, apMock, configMock, storageMock);

        expect(service1).not.toBe(service2);
    });
});
