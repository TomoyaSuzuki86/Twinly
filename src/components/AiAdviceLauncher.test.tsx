import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {AiAdviceLauncher} from './AiAdviceLauncher';

const mock=vi.hoisted(()=>({service:vi.fn()}));
vi.mock('@/lib/ai',()=>({callService:mock.service}));

const premium={plan:'premium',canPreview:true,features:{aiReview:true,aiChat:true,dailySummaryEmail:true}};
const free={plan:'free',canPreview:true,features:{aiReview:false,aiChat:false,dailySummaryEmail:false}};

describe('AI advice menu integration',()=>{
  afterEach(()=>{cleanup();localStorage.clear();delete document.documentElement.dataset.twinlyAiAdvice;});
  beforeEach(()=>mock.service.mockReset());

  it('does not create a home launcher element and keeps free access inactive',async()=>{
    mock.service.mockImplementation(async(name)=>name==='getFamilyAccess'?free:free);
    render(<div><button aria-label="週間タイムラインを開く">timeline</button><AiAdviceLauncher/></div>);
    await waitFor(()=>expect(document.documentElement.dataset.twinlyAiAdvice).toBe('premium-required'));
    expect(document.querySelector('[data-twinly-ai-advice-button="true"]')).toBeNull();
    expect(document.querySelector('button[aria-label="AIアドバイスを見る"]')).toBeNull();
    window.dispatchEvent(new Event('twinly-ai-advice-open'));
    expect(screen.queryByText('今日のAIアドバイス')).not.toBeInTheDocument();
  });

  it('opens directly from the menu event for premium and keeps AI question controls working',async()=>{
    mock.service.mockImplementation(async(name,data)=>{
      if(name==='getFamilyAccess')return premium;
      if(name==='twinlyAi'&&data?.mode==='review')return {observations:'最近は安定しています',checks:'今日も睡眠を確認してください',generatedAt:Date.now()};
      if(name==='twinlyAi'&&data?.mode==='ask')return {answer:'直近の集計では大きな変化はありません。',source:'review',generatedAt:Date.now()};
      return premium;
    });

    render(<div><button aria-label="週間タイムラインを開く">timeline</button><AiAdviceLauncher/></div>);
    await waitFor(()=>expect(document.documentElement.dataset.twinlyAiAdvice).toBe('enabled'));
    expect(document.querySelector('[data-twinly-ai-advice-button="true"]')).toBeNull();
    window.dispatchEvent(new Event('twinly-ai-advice-open'));
    await screen.findByText('今日のAIアドバイス');
    expect(screen.queryByLabelText('AIへの質問')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button',{name:'同意してアドバイスを見る'}));
    await screen.findByText('最近は安定しています');

    expect(screen.getByText('AIに質問する')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'start voice input'})).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('AIへの質問'),{target:{value:'最近、睡眠は減ってる？'}});
    fireEvent.click(screen.getByRole('button',{name:'質問する'}));
    expect(await screen.findByText('直近の集計では大きな変化はありません。')).toBeInTheDocument();
    await waitFor(()=>expect(mock.service.mock.calls.some(([name,data])=>name==='twinlyAi'&&data?.mode==='ask')).toBe(true));
  });
});
