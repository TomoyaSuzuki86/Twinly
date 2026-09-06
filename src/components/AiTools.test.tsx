import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {AiTools} from './AiTools';
import {createInitialAppState} from '@/lib/app-state';

const mock=vi.hoisted(()=>({call:vi.fn()}));
vi.mock('@/firebase',()=>({db:null,functions:null}));
vi.mock('@/lib/ai',async importOriginal=>({...await importOriginal<typeof import('@/lib/ai')>(),callService:mock.call}));

const free={plan:'free',canPreview:true,features:{aiReview:false,aiChat:false,dailySummaryEmail:false}};
const premium={plan:'premium',canPreview:true,features:{aiReview:true,aiChat:true,dailySummaryEmail:true}};
const emailSettings={enabled:false,hourJst:21,recipients:['family@example.com'],canEdit:true};

function renderTools(){
  render(<AiTools familyId="test" app={createInitialAppState()} onSave={()=>true}/>);
  fireEvent.click(screen.getByRole('button',{name:'プラン・AI'}));
}

describe('AI feature preview',()=>{
  afterEach(cleanup);
  beforeEach(()=>mock.call.mockReset());

  it('switches AI controls together while never submitting payment',async()=>{
    mock.call.mockImplementation(async(name,data)=>{
      if(name==='getDailySummaryEmailSettings')return emailSettings;
      if(name==='setFamilyPreviewPlan')return data.plan==='premium'?premium:free;
      return free;
    });
    renderTools();
    const toggle=await screen.findByRole('switch');
    expect(screen.getByRole('button',{name:'AIアドバイスを見る'})).toBeDisabled();
    fireEvent.click(toggle);
    await waitFor(()=>expect(screen.getByRole('switch')).toHaveAttribute('aria-checked','true'));
    fireEvent.click(screen.getByRole('checkbox',{name:/AIアドバイス・質問時/}));
    expect(screen.getByRole('button',{name:'AIアドバイスを見る'})).toBeEnabled();
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(()=>expect(screen.getByRole('button',{name:'AIアドバイスを見る'})).toBeDisabled());
    expect(mock.call.mock.calls.some(([name])=>name==='setFamilyPreviewPlan')).toBe(true);
  });

  it('asks a follow-up only after the daily review is available',async()=>{
    const review={observations:'最近は安定しています',checks:'睡眠時間を確認しましょう',generatedAt:Date.now()};
    mock.call.mockImplementation(async(name,data)=>{
      if(name==='getFamilyAccess')return premium;
      if(name==='getDailySummaryEmailSettings')return emailSettings;
      if(name==='twinlyAi'&&data.mode==='review')return review;
      if(name==='twinlyAi'&&data.mode==='ask')return {answer:'直近の集計では大きな変化はありません。',source:'review',generatedAt:Date.now()};
      return premium;
    });
    renderTools();
    await screen.findByRole('switch');
    fireEvent.click(screen.getByRole('checkbox',{name:/AIアドバイス・質問時/}));
    expect(screen.queryByRole('button',{name:'質問する'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'AIアドバイスを見る'}));
    await screen.findByText('最近は安定しています');
    fireEvent.change(screen.getByLabelText('AIへの質問'),{target:{value:'最近、睡眠は減ってる？'}});
    fireEvent.click(screen.getByRole('button',{name:'質問する'}));
    expect(await screen.findByText('直近の集計では大きな変化はありません。')).toBeInTheDocument();
    expect(mock.call.mock.calls.some(([name,data])=>name==='twinlyAi'&&data.mode==='ask')).toBe(true);
  });

  it('saves the family daily-summary email hour',async()=>{
    mock.call.mockImplementation(async(name,data)=>{
      if(name==='getFamilyAccess')return premium;
      if(name==='getDailySummaryEmailSettings')return emailSettings;
      if(name==='setDailySummaryEmailSettings')return {...emailSettings,...data,enabled:true};
      return premium;
    });
    renderTools();
    await screen.findByRole('switch');
    fireEvent.click(screen.getByRole('checkbox',{name:'毎日メールを送る'}));
    fireEvent.change(screen.getByLabelText('日次まとめメール送信時刻'),{target:{value:'22'}});
    fireEvent.click(screen.getByRole('button',{name:'メール設定を保存'}));
    await waitFor(()=>expect(mock.call.mock.calls.some(([name,data])=>name==='setDailySummaryEmailSettings'&&data.hourJst===22&&data.enabled===true)).toBe(true));
  });
});
