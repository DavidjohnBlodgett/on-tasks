// Copyright 2014-2015, Renasar Technologies Inc.
/* jshint node: true */

'use strict';

var snmp = require('snmpjs');

describe('SnmpTool', function() {
    var SnmpTool;
    var agent;

    before('snmp tool before', function() {
        helper.setupInjector([
            helper.require('/lib/utils/job-utils/net-snmp-tool'),
            helper.require('/lib/utils/job-utils/net-snmp-parser')
        ]);

        // setting up a snmp agent to respond on this one oid (faking system up time
        // with a hard coded 345) on 0.0.0.0.
        //
        // cool: now we could access this integer here:
        //  > snmpget -v 2c -c any localhost .1.3.6.1.2.1.1.3.0
        // and the result would be:
        //  > DISMAN-EVENT-MIB::sysUpTimeInstance = INTEGER: 345
        agent = snmp.createAgent();

        agent.request({ oid: '.1.3.6.1.2.1.1.3.0', handler: function(prq) {
            var val = snmp.data.createData({ type: 'OctetString', value: '345' });
            snmp.provider.readOnlyScalar(prq, val);
        } });

        agent.bind({ family: 'udp4', port: 5588 });

        SnmpTool = helper.injector.get('JobUtils.Snmptool');
    });

    describe('Base', function() {
        it('should exist', function() {
            should.exist(SnmpTool);
        });

        it('should be a function', function() {
            SnmpTool.should.be.a('function');
        });
    });

    describe('instance', function() {
        var instance;

        before(function() {
            instance = new SnmpTool('127.0.0.1:5588', 'any');
        });

        describe('walk', function() {
            it('is a function', function() {
                expect(instance).to.be.a('object');
            });

            it('exists', function() {
                should.exist(instance);
                should.exist(instance.walk);
            });

            it('is a function', function() {
                expect(instance.walk).is.a('function');
            });

            it('returns ChildProcess output object', function() {
                return instance.walk('.1.3.6.1.2.1.1.3')
                .then(function(out) {
                    expect(out).to.have.property('stdout').that.is.a('string');
                });
            });
        });

        describe('get', function() {
            it('exists', function() {
                should.exist(instance.get);
            });
            it('is a function', function() {
                expect(instance.get).is.a('function');
            });
        });

        describe('ping', function() {
            beforeEach(function() {
                this.sandbox = sinon.sandbox.create();
            });

            afterEach(function() {
                this.sandbox.restore();
            });

            it('exists', function() {
                should.exist(instance.ping);
            });
            it('is a function', function() {
                expect(instance.ping).is.a('function');
            });
            it('should ping the host', function() {
                var getStub = this.sandbox.stub(instance, 'get');
                getStub.resolves();
                return instance.ping()
                .then(function() {
                    expect(instance.get).to.have.been.calledOnce;
                });
            });
            it('should fail if host cannot be reached', function() {
                var getStub = this.sandbox.stub(instance, 'get');
                getStub.rejects();
                return instance.ping().should.be.rejected;
            });
        });

        describe('collectHostSnmp', function() {
            var results;
            before(function() {
                results = {
                    stdout: 'LLDP-MIB::lldpMessageTxInterval.0 30 seconds\n' +
                            'LLDP-MIB::lldpMessageTxHoldMultiplier.0 4\n' +
                            'LLDP-MIB::lldpReinitDelay.0 2 seconds\n' +
                            'LLDP-MIB::lldpTxDelay.0 2 seconds\n' +
                            'LLDP-MIB::lldpNotificationInterval.0 5 seconds\n'
                };
            });

            beforeEach(function() {
                this.sandbox = sinon.sandbox.create();
            });

            afterEach(function() {
                this.sandbox.restore();
            });

            it('should run an snmpwalk', function() {
                this.sandbox.stub(instance, 'walk').resolves(results);

                return instance.collectHostSnmp(['test'], {})
                .then(function(out) {
                    expect(out).to.have.length(1);
                    expect(out[0]).to.have.property('source').that.equals('test');
                    expect(out[0]).to.have.property('values').that.deep.equals({
                        'LLDP-MIB::lldpMessageTxInterval.0': '30 seconds',
                        'LLDP-MIB::lldpTxDelay.0': '2 seconds',
                        'LLDP-MIB::lldpMessageTxHoldMultiplier.0': '4',
                        'LLDP-MIB::lldpReinitDelay.0': '2 seconds',
                        'LLDP-MIB::lldpNotificationInterval.0': '5 seconds'
                    });
                });
            });

            it('should run an snmpwalk for multiple oids', function() {
                this.sandbox.stub(instance, 'walk').resolves(results);

                return instance.collectHostSnmp(['test0', 'test1', 'test2'], {})
                .then(function(out) {
                    expect(out).to.have.length(3);
                    expect(out[0]).to.have.property('source').that.equals('test0');
                    expect(out[1]).to.have.property('source').that.equals('test1');
                    expect(out[2]).to.have.property('source').that.equals('test2');
                    _.forEach(out, function(el) {
                        expect(el).to.have.property('values').that.deep.equals({
                            'LLDP-MIB::lldpMessageTxInterval.0': '30 seconds',
                            'LLDP-MIB::lldpTxDelay.0': '2 seconds',
                            'LLDP-MIB::lldpMessageTxHoldMultiplier.0': '4',
                            'LLDP-MIB::lldpReinitDelay.0': '2 seconds',
                            'LLDP-MIB::lldpNotificationInterval.0': '5 seconds'
                        });
                    });
                });
            });

            it('should run a custom supported snmp query method', function() {
                this.sandbox.stub(instance, 'get').resolves(results);

                return instance.collectHostSnmp(['test'], { snmpQueryType: 'get' })
                .then(function() {
                    expect(instance.get).to.have.been.calledOnce;
                });
            });

            it('should run bulkget queries with combined oids and maxRepetitions set', function() {
                this.sandbox.stub(instance, 'bulkget').resolves(results);

                return instance.collectHostSnmp(
                    ['test0', 'test1', 'test2'],
                    { snmpQueryType: 'bulkget', maxRepetitions: 25 }
                )
                .then(function() {
                    expect(instance.bulkget).to.have.been.calledOnce;
                    expect(instance.bulkget.firstCall.args[0]).to.equal('test0 test1 test2');
                    expect(instance.bulkget.firstCall.args[1]).to.equal(25);
                });
            });

            it('should run bulkwalk queries with combined oids and maxRepetitions set', function() {
                this.sandbox.stub(instance, 'bulkwalk').resolves(results);

                return instance.collectHostSnmp(
                    ['test0', 'test1', 'test2'],
                    { snmpQueryType: 'bulkwalk', maxRepetitions: 25 }
                )
                .then(function() {
                    expect(instance.bulkwalk).to.have.been.calledOnce;
                    expect(instance.bulkwalk.firstCall.args[0]).to.equal('test0 test1 test2');
                    expect(instance.bulkwalk.firstCall.args[1]).to.equal(25);
                });
            });
        });
    });
});
