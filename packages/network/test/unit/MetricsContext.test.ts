import { MetricsContext } from '../../src/helpers/MetricsContext'

const STARTUP_TIME = 100

describe('metrics', () => {
    let context: MetricsContext

    beforeEach(() => {
        jest.useFakeTimers('modern')
        jest.setSystemTime(STARTUP_TIME)
        context = new MetricsContext('peerId')
    })

    afterEach(() => {
        jest.runOnlyPendingTimers()
        jest.useRealTimers()
    })

    it('empty report', async () => {
        const rep = await context.report(false)
        expect(rep).toEqual({
            peerId: 'peerId',
            startTime: 100,
            currentTime: 100,
            metrics: {}
        })
    })

    it('report with (empty) metrics', async () => {
        context.create('metricOne')
        context.create('metricTwo')
        context.create('metricThree')

        const rep = await context.report()
        expect(rep).toEqual({
            peerId: 'peerId',
            startTime: 100,
            currentTime: 100,
            metrics: {
                metricOne: {},
                metricTwo: {},
                metricThree: {}
            }
        })
    })

    it('report with a metric with values', async () => {
        context.create('metricOne')
            .addQueriedMetric('a', () => 666)
            .addQueriedMetric('b', () => -10)
            .addRecordedMetric('c')
            .addFixedMetric('d', 0)

        context.create('metricTwo')

        const metricThree = context.create('metricThree')
            .addRecordedMetric('a')
            .addFixedMetric('d', -1)

        metricThree.record('a', 50)
        metricThree.record('a', 100)
        metricThree.addFixedMetric('d', 32)

        const rep = await context.report()
        expect(rep).toEqual({
            peerId: 'peerId',
            startTime: 100,
            currentTime: 100,
            metrics: {
                metricOne: {
                    a: 666,
                    b: -10,
                    c: {
                        rate: 0,
                        last: 0,
                        total: 0,
                    },
                    d: 0
                },
                metricTwo: {},
                metricThree: {
                    a: {
                        rate: 150,
                        last: 150,
                        total: 150
                    },
                    d: 32
                }
            }
        })
    })

    it('clearing "last" metric with report(true)', async () => {
        const metric = context.create('metric')
            .addRecordedMetric('a')

        metric.record('a', 5)
        metric.record('a', 5)

        const rep1 = await context.report(true) // cleared _afterwards_
        expect(rep1.metrics.metric).toEqual({
            a: {
                rate: 10,
                last: 10,
                total: 10
            }
        })

        metric.record('a', 5)

        const rep2 = await context.report(false) // not cleared
        expect(rep2.metrics.metric).toEqual({
            a: {
                rate: 15,
                last: 5,
                total: 15
            }
        })

        metric.record('a', 5)

        const rep3 = await context.report(false) // not cleared
        expect(rep3.metrics.metric).toEqual({
            a: {
                rate: 20,
                last: 10,
                total: 20
            }
        })
    })

    it('same name cannot be created two times', () => {
        context.create('metricOne')
        expect(() => {
            context.create('metricOne')
        }).toThrowError('Metrics "metricOne" already created.')
    })

    it('same subname cannot be added two times', () => {
        const metrics = context.create('metricOne')
        metrics.addRecordedMetric('metric')
        expect(() => {
            metrics.addQueriedMetric('metric', (() => {}) as any)
        }).toThrowError('Metric "metricOne.metric" already registered.')
        expect(() => {
            metrics.addFixedMetric('metric', 0)
        }).toThrowError('Metric "metricOne.metric" already registered.')
    })

    it('cannot record for non-existing recoded metric', () => {
        const metrics = context.create('metricOne')
        expect(() => {
            metrics.record('non-existing-metric', (() => {}) as any)
        }).toThrowError('Not a recorded metric "metricOne.non-existing-metric".')
    })

    it('cannot set for non-existing recoded metric', () => {
        const metrics = context.create('metricOne')
        expect(() => {
            metrics.set('non-existing-metric', 64)
        }).toThrowError('Not a fixed metric "metricOne.non-existing-metric".')
    })

    it('longer scenario', async () => {
        let counter = 0
        const metricOne = context.create('metricOne')
            .addQueriedMetric('a', () => {
                counter += 5
                return counter
            })
            .addQueriedMetric('b', () => 666)
            .addRecordedMetric('c')

        metricOne.record('c', 100)

        const rep1 = await context.report()
        expect(rep1.metrics).toEqual({
            metricOne: {
                a: 5,
                b: 666,
                c: {
                    last: 100,
                    rate: 100,
                    total: 100
                }
            },
        })

        jest.advanceTimersByTime(200)

        const metricTwo = context.create('metricTwo')
            .addRecordedMetric('a')
            .addFixedMetric('b')
        metricTwo.record('a', 10)
        metricTwo.set('b', 50)

        const rep2 = await context.report(true)
        expect(rep2.metrics).toEqual({
            metricOne: {
                a: 10,
                b: 666,
                c: {
                    rate: 100,
                    last: 100,
                    total: 100
                }
            },
            metricTwo: {
                a: {
                    rate: 10,
                    last: 10,
                    total: 10
                },
                b: 50
            }
        })

        jest.advanceTimersByTime(2000)
        metricOne.record('c', 208)
        metricTwo.record('a', 39)
        metricTwo.set('b', 100)
        jest.advanceTimersByTime(2000)

        const elapsedSeconds = Math.floor((Date.now() - STARTUP_TIME) / 1000)
        const rep3 = await context.report()
        expect(rep3.metrics).toEqual({
            metricOne: {
                a: 15,
                b: 666,
                c: {
                    rate: 308 / elapsedSeconds,
                    last: 208,
                    total: 308
                }
            },
            metricTwo: {
                a: {
                    rate: 49 / elapsedSeconds,
                    last: 39,
                    total: 49
                },
                b: 100
            }
        })
    })
})
