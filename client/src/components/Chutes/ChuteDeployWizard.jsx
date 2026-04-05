import { useState, useEffect } from 'react';
import { getTemplate } from '../../services/chutesService';

export default function ChuteDeployWizard({ templates, initialTemplate, onSubmit, onClose }) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    template: initialTemplate || 'vllm',
    username: '',
    model: {
      name: '',
      source: 'huggingface',
    },
    hardware: {
      gpu_count: 1,
      min_vram_gb_per_gpu: 24,
    },
    tagline: '',
  });

  const [selectedTemplateData, setSelectedTemplateData] = useState(null);

  useEffect(() => {
    if (formData.template) {
      loadTemplateData(formData.template);
    }
  }, [formData.template]);

  async function loadTemplateData(key) {
    try {
      const result = await getTemplate(key);
      if (result.ok && result.template) {
        setSelectedTemplateData(result.template);
        setFormData(prev => ({
          ...prev,
          model: {
            ...prev.model,
            name: result.template.model?.name || '',
          },
          hardware: result.template.hardware || prev.hardware,
          tagline: result.template.tagline || '',
        }));
      }
    } catch (err) {
      console.error('Failed to load template:', err);
    }
  }

  function handleChange(field, value) {
    setFormData(prev => {
      const newData = { ...prev };
      if (field.includes('.')) {
        const [parent, child] = field.split('.');
        newData[parent] = { ...newData[parent], [child]: value };
      } else {
        newData[field] = value;
      }
      return newData;
    });
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    
    const result = await onSubmit(formData);
    
    if (result.success) {
      onClose();
    } else {
      setError(result.error || 'Failed to create config');
    }
    
    setLoading(false);
  }

  // Get flat list of template options
  const templateOptions = templates.flatMap(group => 
    (group.options || []).map(opt => ({
      ...opt,
      groupId: group.id,
      groupLabel: group.label,
    }))
  );

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-auto border border-gray-700">
        {/* Header */}
        <div className="sticky top-0 bg-gray-800 border-b border-gray-700 p-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Create New Chute</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Progress */}
        <div className="px-4 pt-4">
          <div className="flex gap-2 mb-4">
            {['Select Template', 'Configure', 'Review'].map((label, i) => (
              <div
                key={i}
                className={`flex-1 text-center py-2 rounded text-sm ${
                  step > i + 1
                    ? 'bg-green-600 text-white'
                    : step === i + 1
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-400'
                }`}
              >
                {i + 1}. {label}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-200 text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Template Selection */}
          {step === 1 && (
            <div className="space-y-4">
              <label className="block">
                <span className="text-gray-300 text-sm">Chute Name *</span>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="my-awesome-chute"
                  className="mt-1 w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                />
              </label>

              <label className="block">
                <span className="text-gray-300 text-sm">Template</span>
                <select
                  value={formData.template}
                  onChange={(e) => handleChange('template', e.target.value)}
                  className="mt-1 w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                >
                  {templateOptions.map(opt => (
                    <option key={opt.key} value={opt.key}>
                      {opt.groupLabel} → {opt.title}
                    </option>
                  ))}
                </select>
              </label>

              {selectedTemplateData && (
                <div className="p-3 bg-gray-700/50 rounded border border-gray-600">
                  <p className="text-sm text-gray-300">{selectedTemplateData.tagline}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Stack: {selectedTemplateData.chute_type}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Configuration */}
          {step === 2 && (
            <div className="space-y-4">
              <label className="block">
                <span className="text-gray-300 text-sm">Chutes Username</span>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => handleChange('username', e.target.value)}
                  placeholder="your-username"
                  className="mt-1 w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                />
              </label>

              <label className="block">
                <span className="text-gray-300 text-sm">Model Name (HuggingFace)</span>
                <input
                  type="text"
                  value={formData.model.name}
                  onChange={(e) => handleChange('model.name', e.target.value)}
                  placeholder="meta-llama/Llama-3.1-8B-Instruct"
                  className="mt-1 w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                />
              </label>

              <label className="block">
                <span className="text-gray-300 text-sm">Tagline</span>
                <input
                  type="text"
                  value={formData.tagline}
                  onChange={(e) => handleChange('tagline', e.target.value)}
                  placeholder="Short description of your chute"
                  className="mt-1 w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                />
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-gray-300 text-sm">GPU Count</span>
                  <select
                    value={formData.hardware.gpu_count}
                    onChange={(e) => handleChange('hardware.gpu_count', parseInt(e.target.value))}
                    className="mt-1 w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                  >
                    {[1, 2, 4, 8].map(n => (
                      <option key={n} value={n}>{n} GPU{n > 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-gray-300 text-sm">Min VRAM per GPU</span>
                  <select
                    value={formData.hardware.min_vram_gb_per_gpu}
                    onChange={(e) => handleChange('hardware.min_vram_gb_per_gpu', parseInt(e.target.value))}
                    className="mt-1 w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500"
                  >
                    {[16, 24, 40, 48, 80].map(n => (
                      <option key={n} value={n}>{n} GB</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-gray-700/50 rounded-lg p-4 border border-gray-600">
                <h3 className="font-medium text-white mb-3">Configuration Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Name:</span>
                    <span className="text-white">{formData.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Template:</span>
                    <span className="text-white">{formData.template}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Model:</span>
                    <span className="text-white">{formData.model.name || 'Not specified'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Hardware:</span>
                    <span className="text-white">
                      {formData.hardware.gpu_count} GPU × {formData.hardware.min_vram_gb_per_gpu}GB
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Username:</span>
                    <span className="text-white">{formData.username || 'Not set'}</span>
                  </div>
                </div>
              </div>

              <p className="text-sm text-gray-400">
                After creating the config, you can build and deploy it from the Local Configs tab.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-800 border-t border-gray-700 p-4 flex justify-between">
          <button
            onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-gray-200 transition-colors"
          >
            {step > 1 ? 'Back' : 'Cancel'}
          </button>
          
          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 && !formData.name}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white disabled:opacity-50 transition-colors"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white disabled:opacity-50 transition-colors"
            >
              {loading ? 'Creating...' : 'Create Config'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
