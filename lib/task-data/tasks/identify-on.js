module.exports = { 
    friendlyName: 'Turn on Node Identify LED',
    injectableName: 'Task.Obm.Node.IdentifyOn',
    implementsTask: 'Task.Base.Obm.Node',
    options: {
        action: 'identifyOn',
        obmServiceName: 'ipmi-obm-service'
    },
    properties: {}	
};