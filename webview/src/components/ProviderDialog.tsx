import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProviderConfig } from '../types/provider';
import type { ModelInfo } from './ChatInputBox/types';
import { setClaudeModels } from './ChatInputBox/types';

interface ProviderDialogProps {
  isOpen: boolean;
  provider?: ProviderConfig | null; // null 表示添加模式
  onClose: () => void;
  onSave: (data: {
    providerName: string;
    remark: string;
    apiKey: string;
    apiUrl: string;
    jsonConfig: string;
  }) => void;
  onDelete?: (provider: ProviderConfig) => void;
  canDelete?: boolean;
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export default function ProviderDialog({
  isOpen,
  provider,
  onClose,
  onSave,
  onDelete: _onDelete,
  canDelete: _canDelete = true,
  addToast: _addToast,
}: ProviderDialogProps) {
  const { t } = useTranslation();
  const isAdding = !provider;
  
  const [providerName, setProviderName] = useState('');
  const [remark, setRemark] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiUrl, setApiUrl] = useState('');

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [showApiKey, setShowApiKey] = useState(false);
  const [jsonConfig, setJsonConfig] = useState('');
  const [jsonError, setJsonError] = useState('');

  const updateEnvField = (key: string, value: string) => {
    try {
      const config = jsonConfig ? JSON.parse(jsonConfig) : {};
      if (!config.env) config.env = {};
      const env = config.env as Record<string, any>;
      const trimmed = typeof value === 'string' ? value.trim() : value;
      if (!trimmed) {
        if (Object.prototype.hasOwnProperty.call(env, key)) {
          delete env[key];
        }
        if (Object.keys(env).length === 0) {
          delete config.env;
        }
      } else {
        env[key] = value;
      }
      setJsonConfig(JSON.stringify(config, null, 2));
      setJsonError('');
    } catch {
    }
  };

  const updateModelsField = (newModels: ModelInfo[]) => {
    try {
      const config = jsonConfig ? JSON.parse(jsonConfig) : {};
      config.models = newModels; // only use top-level models
      setJsonConfig(JSON.stringify(config, null, 2));
      setJsonError('');
    } catch {
      // ignore
    }
  };

  // 格式化 JSON
  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(jsonConfig);
      setJsonConfig(JSON.stringify(parsed, null, 2));
      setJsonError('');
    } catch (err) {
      setJsonError(t('settings.provider.dialog.jsonError'));
    }
  };

  // 初始化表单
  useEffect(() => {
    if (isOpen) {
      if (provider) {
        // 编辑模式
        setProviderName(provider.name || '');
        setRemark(provider.remark || provider.websiteUrl || '');
        setApiKey(provider.settingsConfig?.env?.ANTHROPIC_AUTH_TOKEN || provider.settingsConfig?.env?.ANTHROPIC_API_KEY || '');
        // 编辑模式下不填充默认值，避免覆盖用户实际使用的第三方代理 URL
        setApiUrl(provider.settingsConfig?.env?.ANTHROPIC_BASE_URL || '');
        // Load models array if provided in top-level
        const modelsArr = provider.settingsConfig?.models || [];
        if (Array.isArray(modelsArr) && modelsArr.length > 0) {
          setModels(modelsArr as ModelInfo[]);
        } else {
          setModels([]);
        }

        const config = provider.settingsConfig || {
          env: {
            ANTHROPIC_AUTH_TOKEN: '',
            ANTHROPIC_BASE_URL: '',
            ANTHROPIC_MODEL: '',
          }
        };
        setJsonConfig(JSON.stringify(config, null, 2));
      } else {
        // 添加模式
        setProviderName('');
        setRemark('');
        setApiKey('');
        setApiUrl('');

        setModels([]);
        const config = {
          env: {
            ANTHROPIC_AUTH_TOKEN: '',
            ANTHROPIC_BASE_URL: '',
            ANTHROPIC_MODEL: '',
          }
        };
        setJsonConfig(JSON.stringify(config, null, 2));
      }
      setShowApiKey(false);
      setJsonError('');
    }
  }, [isOpen, provider]);

  // ESC 键关闭
  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newApiKey = e.target.value;
    setApiKey(newApiKey);
    updateEnvField('ANTHROPIC_AUTH_TOKEN', newApiKey);
  };

  const handleApiUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newApiUrl = e.target.value;
    setApiUrl(newApiUrl);
    updateEnvField('ANTHROPIC_BASE_URL', newApiUrl);
  };



  // Model list helpers
  const addModel = () => {
    const blank: ModelInfo = { id: '', label: '', description: '' };
    setModels(prev => {
      const next = [...prev, blank];
      updateModelsField(next);
      return next;
    });
  };

  const updateModel = (index: number, key: keyof ModelInfo, value: string) => {
    setModels(prev => {
      const next = prev.map((m, i) => i === index ? { ...m, [key]: value } : m);
      updateModelsField(next);
      return next;
    });
  };

  const removeModel = (index: number) => {
    setModels(prev => {
      const next = prev.filter((_, i) => i !== index);
      updateModelsField(next);
      return next;
    });
  };

  const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newJson = e.target.value;
    setJsonConfig(newJson);
    
    try {
      const config = JSON.parse(newJson);
      const env = config.env || {};

      if (Object.prototype.hasOwnProperty.call(env, 'ANTHROPIC_AUTH_TOKEN')) {
        setApiKey(env.ANTHROPIC_AUTH_TOKEN || '');
      } else if (Object.prototype.hasOwnProperty.call(env, 'ANTHROPIC_API_KEY')) {
        setApiKey(env.ANTHROPIC_API_KEY || '');
      } else {
        setApiKey('');
      }

      if (Object.prototype.hasOwnProperty.call(env, 'ANTHROPIC_BASE_URL')) {
        setApiUrl(env.ANTHROPIC_BASE_URL || '');
      } else {
        setApiUrl('');
      }

      // load models[] if present in top-level
      const modelsArr = config.models || [];
      if (Array.isArray(modelsArr) && modelsArr.length > 0) {
        setModels(modelsArr as ModelInfo[]);
      } else {
        setModels([]);
      }
      setJsonError('');
    } catch (err) {
      setJsonError(t('settings.provider.dialog.jsonError'));
    }
  };

  const handleSave = () => {
    // Before saving, merge current edited model lists into jsonConfig
    try {
      const cfg = jsonConfig ? JSON.parse(jsonConfig) : {};
      cfg.models = models;
      const mergedJson = JSON.stringify(cfg, null, 2);
      // update runtime models immediately
      try { setClaudeModels(models); } catch {}

      onSave({
        providerName,
        remark,
        apiKey,
        apiUrl,
        jsonConfig: mergedJson,
      });
      return;
    } catch (e) {
      // fallback to original save if JSON malformed
    }

    onSave({ providerName, remark, apiKey, apiUrl, jsonConfig });
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="dialog-overlay">
      <div className="dialog provider-dialog">
        <div className="dialog-header">
          <h3>{isAdding ? t('settings.provider.dialog.addTitle') : t('settings.provider.dialog.editTitle', { name: provider?.name })}</h3>
          <button className="close-btn" onClick={onClose}>
            <span className="codicon codicon-close"></span>
          </button>
        </div>

        <div className="dialog-body">
          <p className="dialog-desc">
            {isAdding ? t('settings.provider.dialog.addDescription') : t('settings.provider.dialog.editDescription')}
          </p>

          <div className="form-group">
            <label htmlFor="providerName">
              {t('settings.provider.dialog.providerName')}
              <span className="required">{t('settings.provider.dialog.required')}</span>
            </label>
            <input
              id="providerName"
              type="text"
              className="form-input"
              placeholder={t('settings.provider.dialog.providerNamePlaceholder')}
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="remark">{t('settings.provider.dialog.remark')}</label>
            <input
              id="remark"
              type="text"
              className="form-input"
              placeholder={t('settings.provider.dialog.remarkPlaceholder')}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="apiKey">
              {t('settings.provider.dialog.apiKey')}
              <span className="required">{t('settings.provider.dialog.required')}</span>
            </label>
            <div className="input-with-visibility">
              <input
                id="apiKey"
                type={showApiKey ? 'text' : 'password'}
                className="form-input"
                placeholder={t('settings.provider.dialog.apiKeyPlaceholder')}
                value={apiKey}
                onChange={handleApiKeyChange}
              />
              <button
                type="button"
                className="visibility-toggle"
                onClick={() => setShowApiKey(!showApiKey)}
                title={showApiKey ? t('settings.provider.dialog.hideApiKey') : t('settings.provider.dialog.showApiKey')}
              >
                <span className={`codicon ${showApiKey ? 'codicon-eye-closed' : 'codicon-eye'}`} />
              </button>
            </div>
            <small className="form-hint">{t('settings.provider.dialog.apiKeyHint')}</small>
          </div>

          <div className="form-group">
            <label htmlFor="apiUrl">
              {t('settings.provider.dialog.apiUrl')}
              <span className="required">{t('settings.provider.dialog.required')}</span>
            </label>
            <input
              id="apiUrl"
              type="text"
              className="form-input"
              placeholder={t('settings.provider.dialog.apiUrlPlaceholder')}
              value={apiUrl}
              onChange={handleApiUrlChange}
            />
            <small className="form-hint">
              <span className="codicon codicon-info" style={{ fontSize: '12px', marginRight: '4px' }} />
              {t('settings.provider.dialog.apiUrlHint')}
            </small>
          </div>

          <div className="form-group">
            <label>{t('settings.provider.dialog.modelMapping') || 'Available models'}</label>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <small style={{ color: '#666' }}>{t('settings.provider.dialog.modelListHint') || 'Edit the models array that will populate the model selector.'}</small>
              <button type="button" className="btn" onClick={addModel} style={{ fontSize: 12 }}>
                + {t('settings.provider.dialog.add') || 'Add'}
              </button>
            </div>
            <div style={{ marginTop: 8 }}>
              {models.length === 0 && <div style={{ color: '#888', fontSize: 12 }}>{t('settings.provider.dialog.noModels') || 'No models configured'}</div>}
              {models.map((m, idx) => (
                <div key={`model-${idx}`} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input
                    className="form-input"
                    placeholder="id"
                    value={m.id || ''}
                    onChange={(e) => updateModel(idx, 'id', e.target.value)}
                    style={{ flex: 2 }}
                  />
                  <input
                    className="form-input"
                    placeholder="label"
                    value={m.label || ''}
                    onChange={(e) => updateModel(idx, 'label', e.target.value)}
                    style={{ flex: 2 }}
                  />
                  <input
                    className="form-input"
                    placeholder="description"
                    value={m.description || ''}
                    onChange={(e) => updateModel(idx, 'description', e.target.value)}
                    style={{ flex: 3 }}
                  />
                  <button type="button" className="btn btn-secondary" onClick={() => removeModel(idx)}>-</button>
                </div>
              ))}
            </div>
            <small className="form-hint">{t('settings.provider.dialog.modelMappingHint')}</small>
          </div>

          {/* 高级选项 - 暂时隐藏，后续会使用 */}
          {/* <details className="advanced-section">
            <summary className="advanced-toggle">
              <span className="codicon codicon-chevron-right" />
              高级选项
            </summary>
            <div style={{ padding: '10px 0', color: '#858585', fontSize: '13px' }}>
              暂无高级选项
            </div>
          </details> */}

          <details className="advanced-section" open>
            <summary className="advanced-toggle">
              <span className="codicon codicon-chevron-right" />
              {t('settings.provider.dialog.jsonConfig')}
            </summary>
            <div className="json-config-section">
              <p className="section-desc" style={{ marginBottom: '12px', fontSize: '12px', color: '#999' }}>
                {t('settings.provider.dialog.jsonConfigDescription')}
              </p>

              {/* 工具栏 */}
              <div className="json-toolbar">
                <button
                  type="button"
                  className="format-btn"
                  onClick={handleFormatJson}
                  title={t('settings.provider.dialog.formatJson') || '格式化 JSON'}
                >
                  <span className="codicon codicon-symbol-keyword" />
                  {t('settings.provider.dialog.formatJson') || '格式化'}
                </button>
              </div>

              <div className="json-editor-wrapper">
                <textarea
                  className="json-editor"
                  value={jsonConfig}
                  onChange={handleJsonChange}
                  placeholder={`{
    "env": {
      "ANTHROPIC_API_KEY": "",
      "ANTHROPIC_AUTH_TOKEN": "",
      "ANTHROPIC_BASE_URL": "",
      "ANTHROPIC_MODEL": ""
    },
    "models": [
      { "id": "claude-sonnet-4-5", "label": "Sonnet 4.5", "description": "Sonnet" }
    ],
    "model": "sonnet",
    "alwaysThinkingEnabled": true,
    "ccSwitchProviderId": "default",
    "codemossProviderId": ""
  }`}
                />
                {jsonError && (
                  <p className="json-error">
                    <span className="codicon codicon-error" />
                    {jsonError}
                  </p>
                )}
              </div>
            </div>
          </details>
        </div>

        <div className="dialog-footer">
          <div className="footer-actions" style={{ marginLeft: 'auto' }}>
            <button className="btn btn-secondary" onClick={onClose}>
              <span className="codicon codicon-close" />
              {t('common.cancel')}
            </button>
            <button className="btn btn-primary" onClick={handleSave}>
              <span className="codicon codicon-save" />
              {isAdding ? t('settings.provider.dialog.confirmAdd') : t('settings.provider.dialog.saveChanges')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
