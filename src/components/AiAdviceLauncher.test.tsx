import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {AiAdviceLauncher} from './AiAdviceLauncher';

const mock=vi.hoisted(()=>({service:vi.fn()}));
vi.mock('@/lib/ai',()=>({callService:mock.service}));

const premium={plan:'premium',canPreview:true,features:{aiReview:true,aiChat:true,dailySummaryEmail:true}};

describe('AI advice follow-up',()=>{
  afterEach(()=>{cleanup();localStorage.clear();});
  beforeEach(()=>mock.service.mockReset());

  it('places text and voice question controls below the generated advice',async()=>{
    mock.service.mockImplementation(async(name,data)=>{
      if(name==='getFamilyAccess')return premium;
      if(name==='twinlyAi'&&data?.mode==='review')return {observations:'最近は安定しています',checks:'今日も睡眠を確認してください',generatedAt:Date.now()};
      if(name==='twinlyAi'&&data?.mode==='ask')return {answer:'直近の集計では大きな変化はありません。',source:'review',generatedAt:Date.now()};
      return premium;
    });

    render(<div><button aria-label="週間タイムラインを開く">timeline</button><AiAdviceLauncher/></div>);
    const launcher=await screen.findByRole('button',{name:'AIアドバイスを見る'});
    fireEvent.click(launcher);
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
