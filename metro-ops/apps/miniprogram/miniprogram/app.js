const {
  DEFAULT_API_BASE_URL,
  DEFAULT_WS_BASE_URL,
  readBackendConfig,
} = require("./utils/backendConfig");
const {
  DEFAULT_OPERATOR_IDENTITY,
  readOperatorIdentity,
} = require("./utils/operatorIdentity");

App({
  onLaunch() {
    const { apiBaseUrl, wsBaseUrl } = readBackendConfig();
    const identity = readOperatorIdentity();
    this.globalData.apiBaseUrl = apiBaseUrl;
    this.globalData.wsBaseUrl = wsBaseUrl;
    this.globalData.operatorId = identity.operatorId;
    this.globalData.operatorName = identity.operatorName;
    this.globalData.operatorRole = identity.role;
  },

  globalData: {
    apiBaseUrl: DEFAULT_API_BASE_URL,
    wsBaseUrl: DEFAULT_WS_BASE_URL,
    operatorId: DEFAULT_OPERATOR_IDENTITY.operatorId,
    operatorName: DEFAULT_OPERATOR_IDENTITY.operatorName,
    operatorRole: DEFAULT_OPERATOR_IDENTITY.role,
  },
});
