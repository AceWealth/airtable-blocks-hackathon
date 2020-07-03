import {
    FieldPickerSynced,
    initializeBlock,
    useBase,
    useGlobalConfig,
    useRecords,
    useSynced,
    TablePickerSynced,
    ViewPickerSynced,
    loadScriptFromURLAsync,
    Input,
    Heading,
    Button,
} from '@airtable/blocks/ui';
import React, { useState } from 'react';

let googleMapsLoaded;

function parseGeocodeCacheValue(cacheValue) {
    return JSON.parse(atob(cacheValue.replace('🔵 ', '')));
}

async function createDistanceTable(apiKey, records, locationField) {
    if (!googleMapsLoaded) {
        googleMapsLoaded = loadScriptFromURLAsync(`https://maps.googleapis.com/maps/api/js?key=${apiKey}`);
    }

    await googleMapsLoaded;

    const recordsToLatLngs = new Map(
        records.map(record => {
            const geocodeCacheValue = record.getCellValue(locationField);
            const locationData = parseGeocodeCacheValue(geocodeCacheValue);
            const { o: { lat, lng } } = locationData;
            const latLng = new google.maps.LatLng(lat, lng);
            return [record, latLng];
        })
    );

    const distanceTable = {};
    const latLngs = Array.from(recordsToLatLngs.values());

    records.forEach(rec => distanceTable[rec.id] = {});

    const origins = latLngs;
    console.log({ origins })
    const destinations = latLngs;
    const service = new google.maps.DistanceMatrixService();

    return new Promise(resolve => {
        service.getDistanceMatrix({
            origins,
            destinations,
            travelMode: 'DRIVING',
        }, (response, status) => {
            console.log('google maps response', response, status);
            if (status == 'OK') {
                const { rows } = response;
                latLngs.forEach((loc1, iOuter) => {
                    const { elements } = rows[iOuter];
                    latLngs.forEach((loc2, iInner) => {
                        if (iOuter === iInner) {
                            return;
                        }
                        const distance = elements[iInner].distance.value;

                        distanceTable[records[iOuter].id][records[iInner].id] = distance;
                    });
                });

                console.log('Distance Table', distanceTable);
                resolve(distanceTable);
            }
        });
    })
}


function DistanceMatrixApp() {
    const base = useBase();
    const globalConfig = useGlobalConfig();
    const tableId = globalConfig.get('selectedTableId');
    const viewId = globalConfig.get('selectedViewId');
    const locationFieldId = globalConfig.get('locationFieldId');
    const [apiKey, setApiKey, canSetApiKey] = useSynced('googleMapsApiKey') as [string, (string) => void, boolean];
    const [distanceTable, setDistanceTable] = useState(null);
    const [pageIndex, setPageIndex] = useState(0);

    const table = base.getTableByIdIfExists(tableId as string);
    const view = table ? table.getViewByIdIfExists(viewId as string) : null;
    const locationField = table ? table.getFieldByIdIfExists(locationFieldId as string) : null;

    const records = useRecords(view);

    const recordsById = records && Object.assign({}, ...records.map(record => ({[record.id]: record})));

    switch (pageIndex) {
        default:
        case 0: {
            return (
                <div>
                    <Heading>Create a table of distances between your locations.</Heading>
                    <div>First, select your locations.</div>
                    <TablePickerSynced globalConfigKey="selectedTableId" />
                    <ViewPickerSynced table={table} globalConfigKey="selectedViewId" />
                    <FieldPickerSynced table={table} globalConfigKey="locationFieldId" />
                    {locationField && <>
                        <div>Next, we will need your Google Maps API key.</div>
                        <Input
                            placeholder="Google Maps API Key"
                            value={apiKey}
                            onChange={event => setApiKey(event.currentTarget.value)}
                            disabled={!canSetApiKey}
                        />
                    </>}
                    {apiKey &&
                        <Button
                            onClick={() => {
                                createDistanceTable(apiKey, records, locationField)
                                    .then(setDistanceTable);
                            }}
                        >
                            Fetch distance matrix from Google Maps
                        </Button>
                    }
                    {distanceTable &&
                        <table>
                            <tr>
                                <th></th>
                                {Object.keys(distanceTable).map(originRecordId =>
                                    <th key={originRecordId}>
                                        {recordsById[originRecordId].name}
                                    </th>
                                )}
                            </tr>
                            {Object.keys(distanceTable).map((originRecordId, outerIndex, keys) =>
                                <tr key={originRecordId}>
                                    <th>{recordsById[originRecordId].name}</th>
                                    {Object.keys(distanceTable[originRecordId]).map((targetRecordId, innerIndex) =>
                                        <>
                                            {outerIndex === innerIndex &&
                                                <td key={originRecordId}>1</td>
                                            }
                                            <td key={targetRecordId}>
                                                {distanceTable[originRecordId][targetRecordId]}
                                            </td>
                                        </>
                                    )}
                                    {outerIndex === keys.length &&
                                        <td key={originRecordId}>1</td>
                                    }
                                </tr>
                            )}
                        </table>
                    }
                </div>
            );
        }
    }
}

initializeBlock(() => <DistanceMatrixApp />);
